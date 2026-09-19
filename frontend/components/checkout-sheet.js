"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle,
  LockKey,
  ShieldCheck,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import PinPad from "./pin-pad";
import ReceiptView from "./receipt-view";
import { CatalogIcon } from "./icon-map";
import { usePaymentFeedback } from "./payment-feedback-provider";
import { createPaymentPin, fetchPaymentMethods } from "../lib/economy";
import { ApiError, formatPaise, newIdempotencyKey } from "../lib/api";

/* ----------------------------------------------------------------------------
   The checkout sheet.

   This is the surface the whole product is judged on, so it models a payment
   the way a real one behaves rather than as a single button:

     review    -> what you are buying, from where, and what you will have left
     sequence  -> the network's own steps, in order, with the PIN inside them
     result    -> the receipt, with the balance the payment produced

   **The sequence is the feature.** A real UPI payment is not one spinner. The
   app opens, the merchant is verified, a collect request is raised, you approve
   it with your PIN, your bank debits, the merchant confirms, and a reference is
   generated. UPI gets ten of those beats; a card gets eight; the internal
   balance gets five.

   Two consequences of how that is built:

   1. **The PIN sits inside the sequence, not before it.** In reality there is
      nothing to approve until the collect request exists, so the pad appears at
      step 4 of 10 with the request already raised behind it. The sheet runs the
      prelude, hands over to the pad, and only fires the request once the PIN is
      given.

   2. **The request starts when the sequence resumes.** The network call is
      fired the moment the postlude begins and its result is held until the
      sequence finishes, so the timing on screen is the timing of the sequence
      and never the timing of the network. Padding a slow request afterwards
      would add that wait twice.

   The idempotency key belongs to an attempt, not to the sheet: it is minted
   when an attempt starts and reused across retries of that same attempt. A
   *declined* attempt mints a new one, because the ledger deliberately refuses
   to replay a key it already marked failed.

   `execute` is injected by the caller, which is why one sheet serves a store
   order, a bill payment, a course enrolment and a savings transfer without
   branching.
   -------------------------------------------------------------------------- */

const money = (paise) => formatPaise(paise);

/* Each flow: a prelude before the credential, the credential itself, and a
   postlude after it. `stepMs` is how long one line stays lit. */
const FLOWS = {
  upi: {
    label: "Paying with UPI",
    stepMs: 380,
    prelude: [
      { label: "Opening your UPI app", icon: "QrCode" },
      { label: "Verifying the merchant", icon: "ShieldCheck" },
      {
        label: "Raising the collect request",
        icon: "ArrowUpRight",
        cue: "request",
        detail: (ctx) => `${money(ctx.amount)} requested by ${ctx.merchant}`,
      },
    ],
    pin: { label: "Approving with your UPI PIN", hint: "Enter your 4-digit UPI PIN" },
    postlude: [
      { label: "Request sent to your bank", icon: "Bank", detail: () => "UPI · NPCI sandbox" },
      { label: "Waiting for your approval", icon: "DeviceMobile" },
      { label: "Authorising the debit", icon: "LockKey" },
      {
        label: "Debiting your account",
        icon: "CurrencyInr",
        detail: () => "Wealthify Bank ······4821",
      },
      { label: "Confirming with the merchant", icon: "Storefront" },
      { label: "Generating the payment reference", icon: "Receipt" },
    ],
  },
  card: {
    label: "Paying by card",
    stepMs: 340,
    prelude: [
      { label: "Connecting to the card network", icon: "WifiHigh" },
      { label: "Verifying the merchant", icon: "ShieldCheck" },
    ],
    pin: { label: "Entering your card PIN", hint: "Enter your 4-digit card PIN" },
    postlude: [
      { label: "Sending to your card issuer", icon: "Bank" },
      { label: "Checking 3-D Secure", icon: "ShieldCheck", detail: () => "Verified by Wealthify" },
      { label: "Authorising the charge", icon: "LockKey" },
      {
        label: "Capturing the payment",
        icon: "CreditCard",
        detail: () => "Wealthify Card ····7412",
      },
      { label: "Confirming with the merchant", icon: "Storefront" },
    ],
  },
  balance: {
    label: "Paying from your balance",
    stepMs: 300,
    prelude: [{ label: "Checking your available balance", icon: "Wallet" }],
    pin: { label: "Confirming with your PIN", hint: "Enter your 4-digit PIN" },
    postlude: [
      { label: "Reserving the amount", icon: "LockKey" },
      { label: "Debiting your balance", icon: "CurrencyInr" },
      { label: "Writing the ledger entry", icon: "Receipt" },
    ],
  },
};

const DEFAULT_FLOW = FLOWS.balance;

const flowFor = (method) => FLOWS[method] ?? DEFAULT_FLOW;

/** The flat, numbered sequence including the credential row. */
function sequenceFor(flow) {
  return [
    ...flow.prelude.map((step) => ({ ...step, kind: "step" })),
    { ...flow.pin, kind: "pin", icon: "LockKey" },
    ...flow.postlude.map((step) => ({ ...step, kind: "step" })),
  ];
}

const FALLBACK_METHODS = [
  { id: "balance", label: "Wealthify balance", hint: "Instant.", icon: "Wallet" },
  { id: "upi", label: "UPI", hint: "Simulated collect request.", icon: "QrCode" },
  { id: "card", label: "Debit card", hint: "Simulated card on file.", icon: "CreditCard" },
];

export default function CheckoutSheet({
  open,
  onClose,
  intent,
  wallet,
  hasPin,
  onPinCreated,
  execute,
  onSuccess,
}) {
  const [step, setStep] = useState("review");
  const [method, setMethod] = useState("upi");
  const [methods, setMethods] = useState(FALLBACK_METHODS);
  const [phase, setPhase] = useState("prelude");
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState(null);
  const [errorNonce, setErrorNonce] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [pendingPin, setPendingPin] = useState("");
  const [pinMode, setPinMode] = useState(hasPin ? "enter" : "create");
  const [closing, setClosing] = useState(false);

  const sheetRef = useRef(null);
  const scrimRef = useRef(null);
  const clientKey = useRef(null);
  const closeTimer = useRef(null);
  const seqTimer = useRef(null);
  const activeRef = useRef(null);
  const feedback = usePaymentFeedback();

  const amount = intent?.amount ?? 0;
  const balanceAfter = (wallet?.cashBalance ?? 0) - amount;
  const shortfall = Math.max(0, -balanceAfter);

  const flow = flowFor(method);
  const sequence = useMemo(() => sequenceFor(flow), [flow]);

  /* A fresh intent is a fresh transaction. Callers render this sheet with
     `key={intent.key}`, so opening a second order remounts the component and
     every field above starts from its initial value — which is what stops the
     second purchase in a session from replaying the first one's receipt.
     Remounting beats an effect here because an effect would have to write state
     synchronously, cascading a render before the first one commits. */

  /* Method list, fetched once on mount rather than on each open, so the review
     step never flashes the fallback copy. The static fallback keeps a network
     blip from blocking checkout entirely. */
  useEffect(() => {
    let cancelled = false;
    fetchPaymentMethods()
      .then((data) => {
        if (!cancelled && data?.methods?.length) setMethods(data.methods);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Body scroll lock + initial focus.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = setTimeout(() => sheetRef.current?.focus(), 30);
    return () => {
      document.body.style.overflow = previous;
      clearTimeout(timer);
    };
  }, [open]);

  /* Keep the lit step in view. The UPI sequence is ten rows long and the sheet
     scrolls; without this the step that is actually happening can sit below the
     fold while the user watches a stale one. */
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [phase, stepIndex, step]);

  /* Two-phase close: `.is-closing` owns the scale-down, then it is removed
     after --modal-close-dur so the next open starts from the resting pre-open
     scale instead of jumping. Dropping the cleanup is the classic bug here. */
  const requestClose = useCallback(() => {
    if (busy) return;
    setClosing(true);
    const styles = getComputedStyle(document.documentElement);
    const parsed = parseFloat(styles.getPropertyValue("--modal-close-dur"));
    const closeMs = Number.isFinite(parsed) ? parsed : 150;
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setClosing(false);
      onClose?.();
    }, closeMs);
  }, [busy, onClose]);

  useEffect(() => () => {
    clearTimeout(closeTimer.current);
    clearTimeout(seqTimer.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, requestClose]);

  /* --- The sequence ------------------------------------------------------
     A self-scheduling chain rather than an interval, so it can be stopped
     mid-flight and so the hand-off into the PIN step is a plain callback
     instead of another piece of state to reconcile. */
  const stopSequence = useCallback(() => {
    clearTimeout(seqTimer.current);
    seqTimer.current = null;
  }, []);

  /* `part` is passed in rather than read from state: the caller sets the phase
     and immediately starts the run, so the state value in this closure would
     still be the previous one. The offset is what makes the flat sequence
     array addressable from either half of the flow. */
  const runSequence = useCallback(
    (count, part, onDone) => {
      stopSequence();
      setStepIndex(0);
      const offset = part === "prelude" ? 0 : flow.prelude.length + 1;
      let index = 0;

      const tick = () => {
        index += 1;
        if (index >= count) {
          onDone?.();
          return;
        }
        setStepIndex(index);
        // One cue per line, which is what makes the sequence audible as
        // progress rather than as a single spinner noise. A step may override
        // it — the UPI collect request pings instead of ticking.
        feedback.play(sequence[offset + index]?.cue ?? "step");
        seqTimer.current = setTimeout(tick, flow.stepMs);
      };

      // The first line is already lit, so the chain starts after one beat.
      seqTimer.current = setTimeout(tick, flow.stepMs);
    },
    [stopSequence, sequence, flow.prelude.length, flow.stepMs, feedback],
  );

  const goToPin = useCallback(() => {
    setPhase("pin");
    setStepIndex(0);
    setStep("pin");
  }, []);

  /* --- The attempt ------------------------------------------------------- */
  const startAttempt = useCallback(
    async (pin) => {
      const key = newIdempotencyKey();
      clientKey.current = key;

      setStep("processing");
      setPhase("postlude");
      setStepIndex(0);
      setBusy(true);
      feedback.play("processing");

      const startedAt = Date.now();
      const minimum = flow.postlude.length * flow.stepMs;
      runSequence(flow.postlude.length, "postlude", stopSequence);

      try {
        const data = await execute({ pin, paymentMethod: method, clientKey: key });
        const elapsed = Date.now() - startedAt;
        if (elapsed < minimum) {
          await new Promise((resolve) => setTimeout(resolve, minimum - elapsed));
        }
        stopSequence();

        setResult(data);
        setStep("result");
        setBusy(false);
        feedback.play(data?.receipt?.direction === "debit" ? "success" : "credit");
        onSuccess?.(data);
      } catch (err) {
        const wait = Math.max(0, 600 - (Date.now() - startedAt));
        if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
        stopSequence();

        setBusy(false);

        if (err instanceof ApiError && (err.code === "PIN_INVALID" || err.code === "PIN_FORMAT")) {
          // Wrong credential: the payment did not happen, so send the user back
          // to the pad — and back to the credential beat of the sequence, which
          // is where they actually are.
          feedback.play("error");
          setPhase("pin");
          setStepIndex(0);
          setStep("pin");
          setError({ code: err.code, message: err.message, attemptsRemaining: err.details?.attemptsRemaining });
          setErrorNonce((n) => n + 1);
          return;
        }

        if (err instanceof ApiError && err.code === "PIN_LOCKED") {
          feedback.play("error");
          setPhase("pin");
          setStepIndex(0);
          setStep("pin");
          setLockedUntil(err.details?.retryAt ?? null);
          setError({ code: err.code, message: err.message });
          setErrorNonce((n) => n + 1);
          return;
        }

        if (err instanceof ApiError && err.code === "PIN_REQUIRED") {
          setPinMode("create");
          goToPin();
          return;
        }

        feedback.play("error");
        setError({
          code: err instanceof ApiError ? err.code : "NETWORK",
          message:
            err instanceof ApiError
              ? err.message
              : "Could not reach Wealthify. Check your connection and try again.",
          details: err instanceof ApiError ? err.details : null,
        });
        setStep("declined");
      }
    },
    [execute, method, feedback, onSuccess, runSequence, stopSequence, goToPin, flow],
  );

  /* --- The credential step ---------------------------------------------- */
  const onPinSubmit = useCallback(
    async (pin) => {
      setError(null);
      setLockedUntil(null);

      if (pinMode === "create") {
        setPendingPin(pin);
        setPinMode("confirm");
        return;
      }

      if (pinMode === "confirm") {
        if (pin !== pendingPin) {
          feedback.play("error");
          setPendingPin("");
          setPinMode("create");
          setError({ code: "PIN_MISMATCH", message: "Those PINs did not match. Start again." });
          setErrorNonce((n) => n + 1);
          return;
        }
        setBusy(true);
        try {
          await createPaymentPin({ pin });
          onPinCreated?.();
          setBusy(false);
          setPinMode("enter");
          await startAttempt(pin);
        } catch (err) {
          setBusy(false);
          setPendingPin("");
          setPinMode("create");
          feedback.play("error");
          setError({
            code: err instanceof ApiError ? err.code : "NETWORK",
            message:
              err instanceof ApiError ? err.message : "Could not save your PIN. Try again.",
          });
          setErrorNonce((n) => n + 1);
        }
        return;
      }

      await startAttempt(pin);
    },
    // `createPaymentPin` is a module-level import, not a reactive value, so it
    // is deliberately not a dependency.
    [pinMode, pendingPin, onPinCreated, startAttempt, feedback],
  );

  /* --- Leaving the review step ------------------------------------------ */
  const beginPayment = useCallback(() => {
    if (!hasPin) setPinMode("create");
    else setPinMode("enter");

    if (flow.prelude.length === 0) {
      goToPin();
      return;
    }

    setStep("processing");
    setPhase("prelude");
    setStepIndex(0);
    feedback.play("processing");
    runSequence(flow.prelude.length, "prelude", goToPin);
  }, [hasPin, flow, runSequence, goToPin, feedback]);

  const canPay = Number.isFinite(amount) && amount > 0 && shortfall === 0;

  const sheetClass = `t-modal t-sheet ${open && !closing ? "is-open" : ""} ${
    closing ? "is-closing" : ""
  }`;
  const scrimClass = `t-scrim ${open && !closing ? "is-open" : ""} ${
    closing ? "is-closing" : ""
  }`;

  const totalSteps = sequence.length;
  const activeIndex =
    phase === "prelude" ? stepIndex : phase === "pin" ? flow.prelude.length : flow.prelude.length + 1 + stepIndex;

  const header = useMemo(() => {
    if (step === "review") return { title: intent?.title ?? "Confirm payment", onBack: null, sub: intent?.merchant };
    if (step === "pin")
      return {
        title: flow.pin.label,
        onBack: () => setStep("review"),
        sub: `Step ${flow.prelude.length + 1} of ${totalSteps}`,
      };
    if (step === "processing")
      return {
        title: flow.label,
        onBack: null,
        sub: `Step ${activeIndex + 1} of ${totalSteps}`,
      };
    if (step === "declined") return { title: "Payment declined", onBack: null, sub: intent?.merchant };
    return { title: "Payment complete", onBack: null, sub: intent?.merchant };
  }, [step, intent, flow, totalSteps, activeIndex]);

  const resolveDetail = useCallback(
    (item) =>
      typeof item.detail === "function"
        ? item.detail({ amount, merchant: intent?.merchant ?? "the merchant" })
        : item.detail,
    [amount, intent?.merchant],
  );

  /* No intent means there is nothing to pay for. Returning null instead of
     rendering an empty review step keeps a "Pay ₹0" bar out of the DOM while
     the sheet is closed — the close animation has already finished by the time
     the parent clears the intent. */
  if (!intent) return null;

  return (
    <div
      aria-hidden={!open}
      // A closed sheet is only faded out, so without `inert` its whole tree
      // would stay in the tab order and the accessibility tree.
      inert={!open}
      className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}
    >
      <div
        ref={scrimRef}
        onClick={requestClose}
        className={`absolute inset-0 bg-ink/45 ${scrimClass}`}
      />

      <div className="absolute inset-x-0 bottom-0 flex justify-center p-0 sm:inset-0 sm:items-center sm:p-6">
        <div
          ref={sheetRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={header.title}
          className={`${sheetClass} focus-ring flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-hairline bg-canvas shadow-[rgba(15,15,15,0.24)_0px_24px_64px_-12px] outline-none sm:max-h-[88dvh] sm:rounded-2xl`}
        >
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-hairline px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-ink">{header.title}</p>
              {header.sub && step !== "result" && (
                <p className="truncate text-[13px] text-steel">{header.sub}</p>
              )}
            </div>
            {header.onBack && (
              <button
                type="button"
                onClick={header.onBack}
                disabled={busy}
                className="btn-ghost focus-ring rounded-lg px-2.5 py-1.5 text-[13px] font-medium disabled:opacity-40"
              >
                Back
              </button>
            )}
            <button
              type="button"
              aria-label="Close"
              onClick={requestClose}
              disabled={busy}
              className="nav-item focus-ring grid h-8 w-8 place-items-center rounded-lg disabled:opacity-40"
            >
              <X size={16} weight="bold" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {/* ---------------- Review ---------------- */}
            {step === "review" && (
              <div>
                <ul className="divide-y divide-hairline-soft rounded-xl border border-hairline">
                  {(intent?.items ?? []).map((item, index) => (
                    <li key={`${item.label}-${index}`} className="flex items-center gap-3 px-4 py-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface text-charcoal">
                        <CatalogIcon name={item.icon ?? intent?.icon} size={18} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-charcoal">
                          {item.label}
                        </span>
                        {item.note && (
                          <span className="block truncate text-[12px] text-steel">{item.note}</span>
                        )}
                      </span>
                      <span className="t-num shrink-0 text-[14px] text-charcoal">
                        {money(item.amount)}
                      </span>
                    </li>
                  ))}
                </ul>

                <dl className="mt-4 space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <dt className="text-[13px] text-steel">Amount due</dt>
                    <dd className="t-num text-[15px] font-semibold text-ink">{money(amount)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <dt className="text-[13px] text-steel">Available balance</dt>
                    <dd className="t-num text-[13px] text-charcoal">{money(wallet?.cashBalance ?? 0)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between border-t border-hairline pt-1.5">
                    <dt className="text-[13px] text-steel">Balance after payment</dt>
                    <dd
                      className={`t-num text-[13px] font-semibold ${
                        shortfall ? "text-[var(--semantic-error)]" : "text-charcoal"
                      }`}
                    >
                      {money(Math.max(0, balanceAfter))}
                    </dd>
                  </div>
                </dl>

                {/* Method picker. Each one names its own sequence length, so the
                    cost of choosing UPI — ten beats instead of five — is visible
                    before it is paid. */}
                <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone">
                  Pay with
                </p>
                <div className="mt-2 grid gap-2">
                  {methods.map((option) => {
                    const selected = option.id === method;
                    const optionFlow = flowFor(option.id);
                    const beats = sequenceFor(optionFlow).length;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setMethod(option.id)}
                        aria-pressed={selected}
                        className={`focus-ring flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                          selected
                            ? "border-primary bg-[color-mix(in_srgb,var(--primary)_6%,white)]"
                            : "border-hairline hover:bg-surface-soft"
                        }`}
                      >
                        <span
                          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                            selected ? "bg-canvas text-primary" : "bg-surface text-charcoal"
                          }`}
                        >
                          <CatalogIcon name={option.icon} size={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-medium text-charcoal">
                            {option.label}
                          </span>
                          <span className="block text-[12px] leading-[1.4] text-steel">
                            {option.hint}
                          </span>
                        </span>
                        <span className="t-num shrink-0 text-[11px] text-stone">
                          {beats} steps
                        </span>
                        <span
                          aria-hidden="true"
                          className={`grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full border ${
                            selected ? "border-primary" : "border-hairline-strong"
                          }`}
                        >
                          {selected && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <p className="mt-3 text-[12px] leading-[1.5] text-stone">
                  Every method here settles from your virtual Wealthify balance. No real
                  payment network is ever contacted.
                </p>

                {error && step === "review" && (
                  <p className="mt-3 flex items-start gap-2 rounded-lg bg-[color-mix(in_srgb,var(--semantic-error)_8%,white)] px-3.5 py-2.5 text-[13px] leading-[1.5] text-[var(--semantic-error)]">
                    <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0" />
                    {error.message}
                  </p>
                )}
              </div>
            )}

            {/* ---------------- PIN ---------------- */}
            {step === "pin" && (
              <div>
                <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-hairline bg-surface-soft px-3.5 py-2.5">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-canvas text-charcoal">
                    <CatalogIcon name="LockKey" size={13} />
                  </span>
                  <span className="t-num shrink-0 text-[12px] font-semibold text-charcoal">
                    Step {flow.prelude.length + 1} of {totalSteps}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-steel">
                    {flow.pin.hint}
                  </span>
                </div>
                <PinPad
                  key={pinMode}
                  mode={pinMode}
                  amount={pinMode === "enter" ? amount : undefined}
                  merchant={intent?.merchant}
                  busy={busy}
                  errorMessage={error?.message ?? ""}
                  errorNonce={errorNonce}
                  lockedUntil={lockedUntil}
                  onSubmit={onPinSubmit}
                  onCancel={requestClose}
                />
              </div>
            )}

            {/* ---------------- Sequence ---------------- */}
            {step === "processing" && (
              <div className="py-1" aria-live="polite">
                <p className="t-num text-center text-[30px] font-semibold tracking-[-0.02em] text-ink">
                  {money(amount)}
                </p>
                {intent?.merchant && (
                  <p className="mt-1 text-center text-sm text-steel">{intent.merchant}</p>
                )}

                <div className="mt-5 flex items-center justify-between">
                  <span className="t-num text-[12px] font-semibold text-charcoal">
                    Step {activeIndex + 1} of {totalSteps}
                  </span>
                  <span className="text-[12px] text-stone">{flow.label}</span>
                </div>

                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-hairline-soft">
                  <span
                    className="block h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                    style={{ width: `${((activeIndex + 1) / totalSteps) * 100}%` }}
                  />
                </div>

                <ol className="mt-4 grid gap-1">
                  {sequence.map((item, index) => {
                    const done = index < activeIndex;
                    const active = index === activeIndex;
                    const detail = resolveDetail(item);
                    return (
                      <li
                        key={`${item.label}-${index}`}
                        ref={active ? activeRef : null}
                        className={`flex items-start gap-3 rounded-lg px-2 py-1.5 transition-colors ${
                          active ? "bg-surface-soft" : ""
                        } ${done || active ? "opacity-100" : "opacity-45"}`}
                      >
                        <span
                          className={`t-num mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${
                            done
                              ? "bg-success text-white"
                              : active
                                ? "bg-primary text-white"
                                : "bg-surface text-stone"
                          }`}
                        >
                          {done ? <CheckCircle size={12} weight="fill" /> : index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block text-[13px] leading-[1.35] ${
                              done ? "text-steel" : active ? "font-medium text-charcoal" : "text-steel"
                            }`}
                          >
                            {item.label}
                          </span>
                          {detail && index <= activeIndex && (
                            <span className="t-num block text-[11px] leading-[1.4] text-stone">
                              {detail}
                            </span>
                          )}
                        </span>
                        {active && (
                          <span
                            aria-hidden="true"
                            className="t-processing-dot mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                          />
                        )}
                      </li>
                    );
                  })}
                </ol>

                <p className="mt-4 flex items-center justify-center gap-1.5 text-[12px] text-stone">
                  <ShieldCheck size={14} weight="fill" className="text-success" />
                  Secured by your Wealthify PIN
                </p>
              </div>
            )}

            {/* ---------------- Declined ---------------- */}
            {step === "declined" && (
              <div className="py-2 text-center">
                <span
                  data-state="in"
                  className="t-success-check mx-auto grid h-14 w-14 place-items-center rounded-full bg-[color-mix(in_srgb,var(--semantic-error)_12%,white)] text-[var(--semantic-error)]"
                >
                  <WarningCircle size={30} weight="fill" />
                </span>
                <p className="mt-4 text-[17px] font-semibold text-ink">Payment not completed</p>
                <p className="mx-auto mt-1.5 max-w-[34ch] text-sm leading-[1.5] text-steel">
                  {error?.message}
                </p>

                {error?.details?.shortfall > 0 && (
                  <dl className="mt-5 space-y-1.5 rounded-xl border border-hairline bg-surface-soft px-4 py-3 text-left">
                    <div className="flex items-baseline justify-between">
                      <dt className="text-[13px] text-steel">Available</dt>
                      <dd className="t-num text-[13px] text-charcoal">
                        {money(error.details.available)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <dt className="text-[13px] text-steel">Required</dt>
                      <dd className="t-num text-[13px] text-charcoal">
                        {money(error.details.required)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between border-t border-hairline pt-1.5">
                      <dt className="text-[13px] font-medium text-charcoal">Short by</dt>
                      <dd className="t-num text-[13px] font-semibold text-[var(--semantic-error)]">
                        {money(error.details.shortfall)}
                      </dd>
                    </div>
                  </dl>
                )}

                <div className="mt-5 grid gap-2">
                  {error?.code === "INSUFFICIENT_FUNDS" && (
                    <Link
                      href="/income"
                      onClick={requestClose}
                      className="btn-primary focus-ring rounded-lg px-4 py-2.5 text-sm font-medium"
                    >
                      Earn some money
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setMethod(method === "upi" ? "balance" : method);
                      setStep("review");
                    }}
                    className="btn-ghost focus-ring rounded-lg border border-hairline px-4 py-2.5 text-sm font-medium"
                  >
                    Back to the order
                  </button>
                </div>
              </div>
            )}

            {/* ---------------- Result ---------------- */}
            {step === "result" && result?.receipt && (
              <ReceiptView
                receipt={result.receipt}
                onDone={requestClose}
                doneLabel="Done"
              />
            )}
          </div>

          {/* ---------------- Pay bar ---------------- */}
          {step === "review" && (
            <div className="border-t border-hairline px-5 py-4">
              {shortfall > 0 && (
                <p className="mb-2.5 flex items-start gap-2 text-[13px] leading-[1.5] text-[var(--semantic-error)]">
                  <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0" />
                  You are {money(shortfall)} short. Earn more or pick something cheaper.
                </p>
              )}
              <button
                type="button"
                disabled={!canPay}
                onClick={beginPayment}
                className="btn-primary focus-ring flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LockKey size={16} weight="bold" />
                <span className="t-num">Pay {money(amount)}</span>
              </button>
              <p className="mt-2.5 text-center text-[12px] text-stone">
                {hasPin
                  ? `${totalSteps} steps · you will confirm with your 4-digit PIN`
                  : "First payment: you will create a 4-digit PIN"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
