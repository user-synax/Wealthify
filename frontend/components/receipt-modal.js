"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import ReceiptView from "./receipt-view";
import { fetchReceipt } from "../lib/economy";

/* Two ways in, one surface out.

   From the feed, only the transaction id is known, so the full row is fetched
   (the list response deliberately drops line items to keep the feed light) and
   a skeleton holds the receipt's shape while that lands, so the modal never
   resizes when the content arrives.

   From a payment that just succeeded the receipt is already in hand, so it is
   passed straight in and nothing is fetched at all. */
export default function ReceiptModal({
  open: openProp,
  transactionId,
  receipt: presetReceipt,
  title = "Receipt",
  onClose,
}) {
  const [fetched, setFetched] = useState(null);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState(false);
  const sheetRef = useRef(null);
  const closeTimer = useRef(null);
  const open = openProp ?? Boolean(transactionId);

  /* Derived rather than stored: a preset receipt (a payment that just
     succeeded) wins over anything fetched, and nothing has to be cleared when
     the modal closes because a new `transactionId` simply fetches its own. */
  const receipt = presetReceipt ?? fetched;

  useEffect(() => {
    if (!open || presetReceipt || !transactionId) return;

    let cancelled = false;
    fetchReceipt(transactionId)
      .then((data) => {
        if (!cancelled) setFetched(data.receipt);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? "Could not load that receipt.");
      });

    return () => {
      cancelled = true;
    };
  }, [open, transactionId, presetReceipt]);

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

  function close() {
    setClosing(true);
    const styles = getComputedStyle(document.documentElement);
    const parsed = parseFloat(styles.getPropertyValue("--modal-close-dur"));
    const closeMs = Number.isFinite(parsed) ? parsed : 150;
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setClosing(false);
      setFetched(null);
      setError("");
      onClose?.();
    }, closeMs);
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // No dependency array on purpose: `close` is recreated each render and the
    // listener is rebound with it, so it always closes over fresh state.
  });

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        onClick={close}
        className={`t-scrim absolute inset-0 bg-ink/45 ${closing ? "is-closing" : "is-open"}`}
      />
      <div className="absolute inset-x-0 bottom-0 flex justify-center sm:inset-0 sm:items-center sm:p-6">
        <div
          ref={sheetRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Receipt"
          className={`t-modal t-sheet ${
            closing ? "is-closing" : "is-open"
          } safe-sheet-bottom focus-ring flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl sm:max-w-md border border-hairline bg-canvas shadow-[rgba(15,15,15,0.24)_0px_24px_64px_-12px] outline-none sm:max-h-[88dvh] sm:rounded-2xl`}
        >
          <div className="flex items-center gap-3 border-b border-hairline px-5 py-3.5">
            <p className="flex-1 text-[15px] font-semibold text-ink">{title}</p>
            <button
              type="button"
              aria-label="Close"
              onClick={close}
              className="nav-item focus-ring grid h-8 w-8 place-items-center rounded-lg"
            >
              <X size={16} weight="bold" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
            {!receipt && !error && (
              <div className="space-y-4" aria-live="polite">
                <div className="t-skel h-9 w-40 rounded-lg" />
                <div className="t-skel h-28 rounded-xl" />
                <div className="t-skel h-4 w-full rounded" />
                <div className="t-skel h-4 w-3/4 rounded" />
                <div className="t-skel h-4 w-2/3 rounded" />
              </div>
            )}
            {error && (
              <p className="rounded-lg bg-surface-soft px-4 py-3 text-sm text-[var(--semantic-error)]">
                {error}
              </p>
            )}
            {receipt && <ReceiptView receipt={receipt} onDone={close} doneLabel="Close" />}
          </div>
        </div>
      </div>
    </div>
  );
}
