"use client";

import { useState } from "react";
import { LockKey, SpeakerHigh, X } from "@phosphor-icons/react";
import Toggle from "./toggle";
import PinPad from "./pin-pad";
import { usePaymentFeedback } from "./payment-feedback-provider";
import { useAuth } from "./auth-provider";
import { createPaymentPin } from "../lib/economy";
import { ApiError } from "../lib/api";

/* ----------------------------------------------------------------------------
   Payment settings: how a payment feels, and the credential behind it.

   The PIN change is a three-step sequence that mirrors the way the PIN was
   created, and it always requires the current PIN first. That ordering is the
   point: a walked-away session must not be able to rebind the payment
   credential, so the server rejects a change without `currentPin` and the UI
   asks for it before showing anything else.
   -------------------------------------------------------------------------- */

const STEPS = {
  current: { title: "Enter your current PIN", mode: "enter" },
  next: { title: "Choose a new PIN", mode: "create" },
  confirm: { title: "Confirm the new PIN", mode: "confirm" },
};

/* Loud is the default the synth is built for; quiet exists so the feature is
   not simply switched off by anyone sharing a room. */
const VOLUME_OPTIONS = [
  { id: "quiet", label: "Quiet" },
  { id: "normal", label: "Normal" },
  { id: "loud", label: "Loud" },
];

export default function PaymentSettings() {
  const { user, refresh } = useAuth();
  const feedback = usePaymentFeedback();
  const [pinOpen, setPinOpen] = useState(false);
  const [stage, setStage] = useState("current");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorNonce, setErrorNonce] = useState(0);
  const [notice, setNotice] = useState("");

  function resetFlow() {
    setStage("current");
    setCurrentPin("");
    setNewPin("");
    setError("");
    setErrorNonce(0);
    setBusy(false);
  }

  async function onPinSubmit(pin) {
    setError("");

    if (stage === "current") {
      setCurrentPin(pin);
      setStage("next");
      return;
    }

    if (stage === "next") {
      setNewPin(pin);
      setStage("confirm");
      return;
    }

    if (pin !== newPin) {
      feedback.play("error");
      setNewPin("");
      setStage("next");
      setError("Those PINs did not match. Start again.");
      setErrorNonce((n) => n + 1);
      return;
    }

    setBusy(true);
    try {
      await createPaymentPin({ pin, currentPin });
      await refresh();
      feedback.play("success");
      setNotice("Payment PIN updated.");
      setPinOpen(false);
      resetFlow();
    } catch (err) {
      setBusy(false);
      const message =
        err instanceof ApiError ? err.message : "Could not update your PIN. Try again.";
      setError(message);
      setErrorNonce((n) => n + 1);
      // A rejected current PIN means the next attempt is back to step one.
      setNewPin("");
      setStage("current");
      feedback.play("error");
    }
  }

  return (
    <section className="rounded-xl border border-hairline bg-canvas p-6">
      <h2 className="text-[18px] font-semibold text-ink">Payments</h2>
      <p className="mt-1 text-sm leading-[1.5] text-steel">
        How the app behaves when money moves. Stored on this device only.
      </p>

      <div className="mt-5 grid gap-4">
        <Toggle
          id="pref-sound"
          label="Payment sounds"
          description={
            feedback.supported.sound
              ? "Short tones for the PIN, the charge and the receipt. Generated on device, nothing is downloaded."
              : "This browser does not support Web Audio."
          }
          checked={feedback.sound}
          disabled={!feedback.supported.sound}
          // The provider previews on enable, so the toggle demonstrates itself.
          onChange={(next) => feedback.setSound(next)}
        />

        {feedback.supported.sound && feedback.sound && (
          <div className="flex items-start justify-between gap-4 border-t border-hairline pt-4">
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-charcoal">Payment volume</p>
              <p className="mt-0.5 text-[12px] leading-[1.5] text-steel">
                How loudly a payment lands. Choosing a level plays it once.
              </p>
            </div>
            <div
              role="radiogroup"
              aria-label="Payment volume"
              className="flex shrink-0 gap-0.5 rounded-lg border border-hairline bg-surface-soft p-0.5"
            >
              {VOLUME_OPTIONS.map((option) => {
                const selected = feedback.volume === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => feedback.setVolume(option.id)}
                    className={`focus-ring rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                      selected
                        ? "bg-canvas text-ink shadow-[rgba(15,15,15,0.06)_0px_1px_2px]"
                        : "text-steel hover:text-charcoal"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <Toggle
          id="pref-haptics"
          label="Haptic feedback"
          description={
            feedback.supported.haptics
              ? "Vibration on keypad taps and when a payment lands. Mobile only."
              : "This device does not expose vibration."
          }
          checked={feedback.haptics}
          disabled={!feedback.supported.haptics}
          onChange={(next) => {
            feedback.setHaptics(next);
            if (next && feedback.supported.haptics) {
              setTimeout(() => feedback.play("key"), 0);
            }
          }}
        />

        <div className="flex items-start justify-between gap-4 border-t border-hairline pt-4">
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-charcoal">Payment PIN</p>
            <p className="mt-0.5 text-[12px] leading-[1.5] text-steel">
              {user?.hasPaymentPin
                ? "Four digits, required for every payment. Locked for 10 minutes after five wrong tries."
                : "Not set yet. You will create one at your first payment."}
            </p>
            {notice && <p className="mt-1 text-[12px] font-medium text-success">{notice}</p>}
          </div>
          <button
            type="button"
            onClick={() => {
              resetFlow();
              setPinOpen(true);
              setNotice("");
            }}
            className="btn-ghost focus-ring inline-flex shrink-0 items-center gap-2 rounded-lg border border-hairline px-3.5 py-2 text-[13px] font-medium"
          >
            <LockKey size={15} />
            {user?.hasPaymentPin ? "Change" : "Create"}
          </button>
        </div>
      </div>

      {pinOpen && (
        <div className="fixed inset-0 z-50">
          <div
            onClick={() => {
              if (!busy) setPinOpen(false);
            }}
            className="t-scrim is-open absolute inset-0 bg-ink/45"
          />
          <div className="absolute inset-x-0 bottom-0 flex justify-center sm:inset-0 sm:items-center sm:p-6">
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Change payment PIN"
              className="t-modal t-sheet is-open flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-hairline bg-canvas shadow-[rgba(15,15,15,0.24)_0px_24px_64px_-12px] sm:rounded-2xl"
            >
              <div className="flex items-center gap-3 border-b border-hairline px-5 py-3.5">
                <p className="flex-1 text-[15px] font-semibold text-ink">{STEPS[stage].title}</p>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => !busy && setPinOpen(false)}
                  className="nav-item focus-ring grid h-8 w-8 place-items-center rounded-lg"
                >
                  <X size={16} weight="bold" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
                <PinPad
                  mode={STEPS[stage].mode}
                  busy={busy}
                  errorMessage={error}
                  errorNonce={errorNonce}
                  onSubmit={onPinSubmit}
                  onCancel={() => !busy && setPinOpen(false)}
                />

                {stage !== "current" && (
                  <p className="mt-4 text-center text-[12px] text-stone">
                    Step {stage === "next" ? 2 : 3} of 3
                  </p>
                )}

                <p className="mt-5 flex items-center justify-center gap-1.5 text-[12px] text-stone">
                  <SpeakerHigh size={13} />
                  {feedback.sound ? "Sound on" : "Sound off"} ·{" "}
                  {feedback.haptics ? "Haptics on" : "Haptics off"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
