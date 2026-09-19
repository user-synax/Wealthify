"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, DownloadSimple, ShieldCheck } from "@phosphor-icons/react";
import { formatDateTime, formatPaise, formatPaiseExact } from "../lib/api";

/* ----------------------------------------------------------------------------
   The receipt.

   One renderer for two moments: the success step inside checkout, and a row
   opened from the activity feed days later. Both read the same immutable
   transaction row, so a receipt can never disagree with the feed it came from.

   `balanceBefore` / `balanceAfter` come off the row rather than from the live
   wallet, which is what makes an old receipt still correct after the user has
   spent the money again.
   -------------------------------------------------------------------------- */

const METHOD_TONE = {
  upi: "text-link",
  card: "text-primary",
  balance: "text-charcoal",
  autopay: "text-[var(--brand-orange)]",
  system: "text-steel",
};

function Line({ label, value, mono = false, strong = false }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-[13px] text-steel">{label}</dt>
      <dd
        className={`text-right text-[13px] ${mono ? "t-num font-mono" : "t-num"} ${
          strong ? "font-semibold text-ink" : "text-charcoal"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Copy the receipt payload as plain text — the thing a user would actually
 * paste into a group chat to prove they paid.
 */
function receiptText(receipt) {
  const lines = [
    receipt.merchant ? `${receipt.merchant}` : "Wealthify",
    "",
    ...(receipt.items?.length
      ? receipt.items.map(
          (item) =>
            `${item.label}${item.note ? ` (${item.note})` : ""}  ${formatPaiseExact(item.amount)}`,
        )
      : [receipt.title]),
    "",
    `Total: ${formatPaiseExact(receipt.amount)}`,
    `Method: ${receipt.methodLabel}`,
    `Status: ${receipt.status === "failed" ? "Failed" : "Paid"}`,
    `Reference: ${receipt.reference}`,
    `Simulated date: ${receipt.simDate}`,
    receipt.balanceAfter != null ? `Balance after: ${formatPaiseExact(receipt.balanceAfter)}` : "",
  ];
  return lines.filter((line) => line !== "").join("\n");
}

export default function ReceiptView({
  receipt,
  compact = false,
  onDone,
  doneLabel = "Done",
}) {
  const [copied, setCopied] = useState(false);
  const digitsRef = useRef(null);

  /* transitions-dev #02 replay: the amount is the number the user just paid, so
     it re-enters on arrival rather than sitting there mid-animation. */
  useEffect(() => {
    const group = digitsRef.current;
    if (!group) return;
    group.classList.remove("is-animating");
    void group.offsetHeight;
    group.classList.add("is-animating");
  }, [receipt?.reference]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!receipt) return null;

  const failed = receipt.status === "failed";
  const amountText = formatPaise(receipt.amount);

  async function copy() {
    try {
      await navigator.clipboard.writeText(receiptText(receipt));
      setCopied(true);
    } catch {
      // Clipboard is blocked outside a secure context or without permission.
      setCopied(false);
    }
  }

  function download() {
    const blob = new Blob([receiptText(receipt)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${receipt.reference}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={compact ? "" : "px-1"}>
      {/* Amount */}
      <div className="text-center">
        <p className="text-[13px] font-medium text-steel">
          {failed ? "Payment failed" : "Amount paid"}
        </p>
        <p className="t-num mt-1.5 text-[40px] font-semibold leading-none tracking-[-0.02em] text-ink">
          <span aria-hidden="true">₹</span>
          <span ref={digitsRef} aria-hidden="true" className="t-digit-group">
            {amountText.replace("₹", "").split("").map((char, index, chars) => (
              <span
                key={`${char}-${index}`}
                className="t-digit"
                data-stagger={
                  index === chars.length - 2 ? "1" : index === chars.length - 1 ? "2" : undefined
                }
              >
                {char}
              </span>
            ))}
          </span>
          <span className="sr-only">{amountText}</span>
        </p>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-[12px] font-semibold">
          <ShieldCheck
            size={13}
            weight="fill"
            className={failed ? "text-[var(--semantic-error)]" : "text-success"}
          />
          <span className={failed ? "text-[var(--semantic-error)]" : "text-success"}>
            {failed ? "Declined" : "Paid in full"}
          </span>
        </p>
      </div>

      {/* Line items */}
      <div className="mt-6 rounded-xl border border-hairline bg-surface-soft px-4 py-3">
        {receipt.merchant && (
          <p className="border-b border-hairline pb-2 text-[13px] font-semibold text-charcoal">
            {receipt.merchant}
          </p>
        )}
        <dl className="divide-y divide-hairline-soft pt-1.5">
          {receipt.items?.length ? (
            receipt.items.map((item, index) => (
              <div key={`${item.label}-${index}`} className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-[13px] text-charcoal">
                  {item.label}
                  {item.note && (
                    <span className="block text-[12px] text-stone">{item.note}</span>
                  )}
                </dt>
                <dd className="t-num shrink-0 text-[13px] text-charcoal">
                  {formatPaiseExact(item.amount)}
                </dd>
              </div>
            ))
          ) : (
            <div className="flex items-baseline justify-between gap-4 py-2">
              <dt className="text-[13px] text-charcoal">{receipt.title}</dt>
              <dd className="t-num text-[13px] text-charcoal">{formatPaiseExact(receipt.amount)}</dd>
            </div>
          )}
        </dl>

        <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-hairline pt-2.5">
          <dt className="text-sm font-semibold text-ink">Total</dt>
          <dd className="t-num text-sm font-semibold text-ink">
            {formatPaiseExact(receipt.amount)}
          </dd>
        </div>
      </div>

      {/* Reference block */}
      <dl className="mt-4 divide-y divide-hairline-soft">
        <Line
          label="Payment method"
          value={
            <span className={METHOD_TONE[receipt.paymentMethod] ?? "text-charcoal"}>
              {receipt.methodLabel}
            </span>
          }
        />
        <Line label="Simulated date" value={receipt.simDate} />
        <Line label="Recorded" value={formatDateTime(receipt.createdAt)} />
        <Line
          label="Payment reference"
          value={<span className="font-mono text-[12px]">{receipt.reference}</span>}
          mono
        />
        {receipt.balanceBefore != null && (
          <Line label="Balance before" value={formatPaiseExact(receipt.balanceBefore)} />
        )}
        {receipt.balanceAfter != null && (
          <Line label="Balance after" value={formatPaiseExact(receipt.balanceAfter)} strong />
        )}
      </dl>

      {receipt.note && (
        <p className="mt-4 rounded-lg bg-surface-soft px-3.5 py-2.5 text-[13px] leading-[1.5] text-steel">
          {receipt.note}
        </p>
      )}

      <p className="mt-4 text-center text-[12px] leading-[1.5] text-stone">
        Simulated payment. No real money moved and no real account was charged.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="btn-primary focus-ring flex-1 rounded-lg px-4 py-2.5 text-sm font-medium"
          >
            {doneLabel}
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          className="btn-ghost focus-ring inline-flex items-center gap-2 rounded-lg border border-hairline px-3.5 py-2.5 text-sm font-medium"
        >
          {copied ? <Check size={16} weight="bold" /> : <Copy size={16} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={download}
          aria-label="Download receipt"
          className="btn-ghost focus-ring grid h-10 w-10 place-items-center rounded-lg border border-hairline"
        >
          <DownloadSimple size={16} />
        </button>
      </div>
    </div>
  );
}
