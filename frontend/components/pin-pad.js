"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Backspace, LockKey } from "@phosphor-icons/react";
import { usePaymentFeedback } from "./payment-feedback-provider";
import { formatPaise, formatDuration } from "../lib/api";
import { msUntil, useNow } from "../lib/use-now";

/* ----------------------------------------------------------------------------
   The PIN step.

   Four digits, an on-screen keypad, and physical keyboard support, because a
   payment that only works with a mouse does not feel like a payment. The digits
   submit the moment the fourth one lands: every Indian UPI flow does this, and
   making the user reach for a separate confirm button after typing a PIN is the
   single fastest way to break the illusion.

   The pad owns its digits and nothing else. Submission, retries and the
   outcome live in the checkout sheet, so this component stays reusable by the
   "create a PIN" and "authorise this payment" steps without branching on which
   one it is.
   -------------------------------------------------------------------------- */

const LENGTH = 4;

const LABELS = {
  enter: {
    title: "Enter payment PIN",
    hint: "Your 4-digit Wealthify PIN",
  },
  create: {
    title: "Create a payment PIN",
    hint: "You will use this for every payment",
  },
  confirm: {
    title: "Confirm your PIN",
    hint: "Enter the same 4 digits again",
  },
};

/* Callers must pass a `key` that changes with the step, e.g.
   `key={pinMode}` — that is what resets the digits between steps. */
export default function PinPad({
  mode = "enter",
  amount,
  merchant,
  busy = false,
  errorMessage = "",
  errorNonce = 0,
  lockedUntil = null,
  onSubmit,
  onCancel,
}) {
  const [digits, setDigits] = useState("");
  const wrapRef = useRef(null);
  const fieldRef = useRef(null);
  const shakeTimer = useRef(null);
  const submittedFor = useRef("");
  const feedback = usePaymentFeedback();
  const labels = LABELS[mode] ?? LABELS.enter;

  /* The parent keys this component on the step, so a mode swap (create ->
     confirm) mounts a fresh pad and the first PIN is never carried over into
     the confirmation field. That is why there is no "clear on mode change"
     effect here: an effect would have to write state synchronously. */
  const now = useNow();

  /* Lockout countdown, derived from the shared ticker rather than stored. A
     locked pad that silently does nothing reads as a broken app, so the
     remaining time is counted out on the keypad itself. */
  const lockedCountdown = msUntil(lockedUntil, now) ?? 0;

  const clear = useCallback(() => {
    setDigits("");
    submittedFor.current = "";
  }, []);

  /* Removes the error treatment. Called when the user starts typing again —
     which is the moment they are already correcting it — rather than on a
     timer. A clock-driven revert is worse in both directions here: too short
     and the reason for the failure vanishes before it can be read, too long and
     the pad still looks broken while the user fixes it. The skill's own
     "typing cancels the auto-revert" note is this, without the timer race. */
  const clearError = useCallback(() => {
    wrapRef.current?.classList.remove("is-error");
    fieldRef.current?.classList.remove("is-error");
  }, []);

  // transitions-dev #12: replay the shake on every new error.
  useEffect(() => {
    if (!errorNonce) return;
    const field = fieldRef.current;
    const wrap = wrapRef.current;
    if (!field || !wrap) return;

    wrap.classList.add("is-error");
    field.classList.add("is-error");
    field.classList.remove("is-shaking");
    void field.offsetWidth; // reflow, so the keyframes restart from 0

    field.classList.add("is-shaking");

    const styles = getComputedStyle(document.documentElement);
    const ms = (name, fallback) => {
      const parsed = parseFloat(styles.getPropertyValue(name));
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const shakeMs = ms("--shake-dur-a", 80) * 2 + ms("--shake-dur-b", 60) * 2;

    clearTimeout(shakeTimer.current);
    shakeTimer.current = setTimeout(() => field.classList.remove("is-shaking"), shakeMs + 20);

    // The digits are wrong, so they must go: leaving four filled dots would
    // invite the user to press submit again with the same wrong PIN.
    clear();
  }, [errorNonce, clear]);

  useEffect(() => () => clearTimeout(shakeTimer.current), []);

  const push = useCallback(
    (digit) => {
      if (busy || lockedCountdown > 0) return;
      clearError();
      feedback.play("key");
      setDigits((current) => (current.length >= LENGTH ? current : current + digit));
    },
    [busy, lockedCountdown, feedback, clearError],
  );

  const pop = useCallback(() => {
    if (busy || lockedCountdown > 0) return;
    clearError();
    feedback.play("key");
    setDigits((current) => current.slice(0, -1));
  }, [busy, lockedCountdown, feedback, clearError]);

  /* Auto-submit, guarded so a re-render cannot fire the same PIN twice while
     the request is in flight. */
  useEffect(() => {
    if (digits.length !== LENGTH || busy) return;
    if (submittedFor.current === digits) return;
    submittedFor.current = digits;
    onSubmit?.(digits);
  }, [digits, busy, onSubmit]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (/^\d$/.test(event.key)) {
        push(event.key);
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        pop();
        return;
      }
      if (event.key === "Escape") onCancel?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [push, pop, onCancel]);

  const locked = lockedCountdown > 0;

  return (
    <div className="t-input-wrap" ref={wrapRef}>
      <div className="text-center">
        <p className="text-[17px] font-semibold text-ink">{labels.title}</p>
        {amount == null ? (
          <p className="mt-1.5 text-sm text-steel">{labels.hint}</p>
        ) : (
          <>
            <p className="t-num mt-1 text-[28px] font-semibold tracking-[-0.02em] text-ink">
              {formatPaise(amount)}
            </p>
            {/* The sheet header already names the merchant in the create /
                confirm steps, where there is no amount to show above it. */}
            {merchant && <p className="mt-0.5 text-sm text-steel">{merchant}</p>}
          </>
        )}
      </div>

      {/* Filled / empty dots. aria-hidden because the real value is announced
          by the live region underneath. */}
      <div
        ref={fieldRef}
        className="t-input mt-6 flex items-center justify-center gap-3 rounded-xl border border-hairline-strong bg-canvas px-6 py-4"
      >
        {Array.from({ length: LENGTH }).map((_, index) => {
          const filled = index < digits.length;
          return (
            <span
              key={index}
              aria-hidden="true"
              data-filled={filled ? "true" : "false"}
              className={`t-pin-dot h-3.5 w-3.5 rounded-full border transition-colors ${
                filled
                  ? "t-pin-dot is-filled border-ink bg-ink"
                  : "border-hairline-strong bg-transparent"
              }`}
            />
          );
        })}
      </div>

      <p aria-live="polite" className="sr-only">
        {locked
          ? "Payments are locked."
          : `${digits.length} of ${LENGTH} digits entered.`}
      </p>

      <div className="t-error-msg mt-2.5 text-center text-[13px] font-medium text-[var(--semantic-error)]">
        {errorMessage}
      </div>

      {locked ? (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-hairline bg-surface px-4 py-3.5 text-center">
          <LockKey size={18} weight="fill" className="text-[var(--brand-orange)]" />
          <p className="text-sm text-charcoal">
            Locked for <span className="t-num font-semibold">{formatDuration(lockedCountdown)}</span>{" "}
            after too many wrong PINs.
          </p>
        </div>
      ) : (
        <div className="mx-auto mt-5 grid w-full max-w-[248px] grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={busy}
              onClick={() => push(digit)}
              className="t-num focus-ring h-13 rounded-xl border border-hairline bg-canvas py-3 text-[20px] font-medium text-ink transition-colors hover:bg-surface active:scale-[0.98] disabled:opacity-50"
            >
              {digit}
            </button>
          ))}
          <span aria-hidden="true" />
          <button
            type="button"
            disabled={busy}
            onClick={() => push("0")}
            className="t-num focus-ring h-13 rounded-xl border border-hairline bg-canvas py-3 text-[20px] font-medium text-ink transition-colors hover:bg-surface active:scale-[0.98] disabled:opacity-50"
          >
            0
          </button>
          <button
            type="button"
            aria-label="Delete digit"
            disabled={busy || digits.length === 0}
            onClick={pop}
            className="focus-ring grid h-13 place-items-center rounded-xl border border-hairline bg-canvas py-3 text-charcoal transition-colors hover:bg-surface active:scale-[0.98] disabled:opacity-40"
          >
            <Backspace size={20} />
          </button>
        </div>
      )}

      {busy && (
        <p className="mt-4 text-center text-[13px] font-medium text-steel">Checking…</p>
      )}

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="btn-ghost focus-ring mx-auto mt-4 block rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Cancel payment
        </button>
      )}
    </div>
  );
}
