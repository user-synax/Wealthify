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
     pin       -> the credential step, which is genuinely blocking
     processing-> staged progress lines, held for a minimum duration
     result    -> the receipt, with the balance the payment produced

   Three deliberate choices:

   1. **The request starts when the animation does.** The network call is fired
      the moment processing begins and its result is held until the minimum
      duration elapses. A real payment is never instant, and a screen that
      resolves in 40ms reads as a fake, but padding the call afterwards would
      add that time to every genuine slow request too.

   2. **The idempotency key belongs to an attempt, not to the sheet.** It is
      minted when an attempt starts and reused across network retries of that
      same attempt. A *declined* attempt mints a new one, because the ledger
      deliberately refuses to replay a key it already marked failed — so the
      key is the identity of "this payment", not of "this screen".

   3. **Timing on screen is not timing in the ledger.** The staged lines are
      cosmetic; the balance, the receipt and the reference all come back from
      the server response and are never computed here.

   `execute` is injected by the caller, which is why one sheet serves a store
   order, a bill payment and a savings transfer without branching.
   -------------------------------------------------------------------------- */

const STAGES = [
  { label: "Contacting Wealthify", icon: "ShieldCheck" },
  { label: "Authorising payment", icon: "LockKey" },
  { label: "Updating your balance", icon: "Wallet" },
];

const STAGE_MS = 620;
const MIN_PROCESSING_MS = 1850;

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
  const [stage, setStage] = useState(0);
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
  const stageTimer = useRef(null);
  const feedback = usePaymentFeedback();

  const amount = intent?.amount ?? 0;
  const balanceAfter = (wallet?.cashBalance ?? 0) - amount;
  const shortfall = Math.max(0, -balanceAfter);

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
    clearInterval(stageTimer.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, requestClose]);

  const runStages = useCallback(() => {
    setStage(0);
    clearInterval(stageTimer.current);
    stageTimer.current = setInterval(
      () => setStage((current) => Math.min(current + 1, STAGES.length - 1)),
      STAGE_MS,
    );
    return () => clearInterval(stageTimer.current);
  }, []);

  /* --- The attempt ------------------------------------------------------- */
  const startAttempt = useCallback(
    async (pin) => {
      const key = newIdempotencyKey();
      clientKey.current = key;

      setStep("processing");
      setBusy(true);
      feedback.play("processing");
      const stopStages = runStages();
      const startedAt = Date.now();

      try {
        const data = await execute({ pin, paymentMethod: method, clientKey: key });
        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_PROCESSING_MS) {
          await new Promise((resolve) => setTimeout(resolve, MIN_PROCESSING_MS - elapsed));
        }
        stopStages();

        setResult(data);
        setStep("result");
        setBusy(false);
        feedback.play(data?.receipt?.direction === "debit" ? "success" : "credit");
        onSuccess?.(data);
      } catch (err) {
        const wait = Math.max(0, 700 - (Date.now() - startedAt));
        if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
        stopStages();

        setBusy(false);

        if (err instanceof ApiError && (err.code === "PIN_INVALID" || err.code === "PIN_FORMAT")) {
          // Wrong credential: the payment did not happen, so send the user back
          // to the pad rather than to a failure screen.
          feedback.play("error");
          setStep("pin");
          setError({ code: err.code, message: err.message, attemptsRemaining: err.details?.attemptsRemaining });
          setErrorNonce((n) => n + 1);
          return;
        }

        if (err instanceof ApiError && err.code === "PIN_LOCKED") {
          feedback.play("error");
          setStep("pin");
          setLockedUntil(err.details?.retryAt ?? null);
          setError({ code: err.code, message: err.message });
          setErrorNonce((n) => n + 1);
          return;
        }

        if (err instanceof ApiError && err.code === "PIN_REQUIRED") {
          setPinMode("create");
          setStep("pin");
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
    [execute, method, feedback, onSuccess, runStages],
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

  const canPay = Number.isFinite(amount) && amount > 0 && shortfall === 0;

  const sheetClass = `t-modal t-sheet ${open && !closing ? "is-open" : ""} ${
    closing ? "is-closing" : ""
  }`;
  const scrimClass = `t-scrim ${open && !closing ? "is-open" : ""} ${
    closing ? "is-closing" : ""
  }`;

  const header = useMemo(() => {
    if (step === "review") return { title: intent?.title ?? "Confirm payment", onBack: null };
    if (step === "pin") return { title: "Authorise payment", onBack: () => setStep("review") };
    if (step === "processing") return { title: "Processing", onBack: null };
    if (step === "declined") return { title: "Payment declined", onBack: null };
    return { title: "Payment complete", onBack: null };
  }, [step, intent?.title]);

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
              {intent?.merchant && step !== "result" && (
                <p className="truncate text-[13px] text-steel">{intent.merchant}</p>
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
                        {formatPaise(item.amount)}
                      </span>
                    </li>
                  ))}
                </ul>

                <dl className="mt-4 space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <dt className="text-[13px] text-steel">Amount due</dt>
                    <dd className="t-num text-[15px] font-semibold text-ink">{formatPaise(amount)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <dt className="text-[13px] text-steel">Available balance</dt>
                    <dd className="t-num text-[13px] text-charcoal">{formatPaise(wallet?.cashBalance ?? 0)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between border-t border-hairline pt-1.5">
                    <dt className="text-[13px] text-steel">Balance after payment</dt>
                    <dd
                      className={`t-num text-[13px] font-semibold ${
                        shortfall ? "text-[var(--semantic-error)]" : "text-charcoal"
                      }`}
                    >
                      {formatPaise(Math.max(0, balanceAfter))}
                    </dd>
                  </div>
                </dl>

                {/* Method picker */}
                <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone">
                  Pay with
                </p>
                <div className="mt-2 grid gap-2">
                  {methods.map((option) => {
                    const selected = option.id === method;
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
            )}

            {/* ---------------- Processing ---------------- */}
            {step === "processing" && (
              <div className="py-2" aria-live="polite">
                <p className="t-num text-center text-[32px] font-semibold tracking-[-0.02em] text-ink">
                  {formatPaise(amount)}
                </p>
                {intent?.merchant && (
                  <p className="mt-1 text-center text-sm text-steel">{intent.merchant}</p>
                )}

                <div className="mt-6 h-1 w-full overflow-hidden rounded-full bg-hairline-soft">
                  <span className="t-processing-bar relative block h-full w-full overflow-hidden" />
                </div>

                <ol className="mt-5 grid gap-2.5">
                  {STAGES.map((item, index) => {
                    const done = index < stage;
                    const active = index === stage;
                    return (
                      <li
                        key={item.label}
                        className={`flex items-center gap-3 text-sm transition-opacity ${
                          done || active ? "opacity-100" : "opacity-40"
                        }`}
                      >
                        <span
                          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                            done
                              ? "bg-tint-mint text-success"
                              : active
                                ? "bg-surface text-charcoal"
                                : "bg-surface-soft text-stone"
                          }`}
                        >
                          {done ? (
                            <CheckCircle size={16} weight="fill" />
                          ) : (
                            <CatalogIcon name={item.icon} size={15} />
                          )}
                        </span>
                        <span className={done ? "text-steel" : "font-medium text-charcoal"}>
                          {item.label}
                        </span>
                      </li>
                    );
                  })}
                </ol>

                <p className="mt-5 flex items-center justify-center gap-1.5 text-[12px] text-stone">
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
                        {formatPaise(error.details.available)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <dt className="text-[13px] text-steel">Required</dt>
                      <dd className="t-num text-[13px] text-charcoal">
                        {formatPaise(error.details.required)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between border-t border-hairline pt-1.5">
                      <dt className="text-[13px] font-medium text-charcoal">Short by</dt>
                      <dd className="t-num text-[13px] font-semibold text-[var(--semantic-error)]">
                        {formatPaise(error.details.shortfall)}
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
                  You are {formatPaise(shortfall)} short. Earn more or pick something cheaper.
                </p>
              )}
              <button
                type="button"
                disabled={!canPay}
                onClick={() => {
                  if (!hasPin) setPinMode("create");
                  setStep("pin");
                }}
                className="btn-primary focus-ring flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LockKey size={16} weight="bold" />
                <span className="t-num">Pay {formatPaise(amount)}</span>
              </button>
              <p className="mt-2.5 text-center text-[12px] text-stone">
                {hasPin
                  ? "You will confirm this with your 4-digit PIN."
                  : "First payment: you will create a 4-digit PIN."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
