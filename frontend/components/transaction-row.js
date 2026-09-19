"use client";

import { CaretRight } from "@phosphor-icons/react";
import { CatalogIcon, accentClass, iconForTransaction } from "./icon-map";
import { formatPaise, formatRelative } from "../lib/api";

/* One row of the immutable log.

   The amount is the only thing allowed to carry colour — green in, charcoal
   out — because a ledger where four things are tinted has no signal left. The
   icon tint is used for category instead, which is why the two never compete.
   -------------------------------------------------------------------------- */
export default function TransactionRow({ transaction, onOpen, dense = false }) {
  if (!transaction) return null;

  const credit = transaction.direction === "credit";
  const isMilestone = transaction.type === "career";

  const Inner = (
    <>
      <span
        className={`grid shrink-0 place-items-center rounded-lg ${
          dense ? "h-9 w-9" : "h-10 w-10"
        } ${accentClass(transaction.accent)}`}
      >
        <CatalogIcon name={iconForTransaction(transaction)} size={dense ? 17 : 19} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-charcoal">
          {transaction.title}
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-steel">
          {formatRelative(transaction.createdAt)}
          {transaction.note ? ` · ${transaction.note}` : ""}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span
          className={`t-num block text-[14px] font-semibold ${
            isMilestone ? "text-primary" : credit ? "text-success" : "text-charcoal"
          }`}
        >
          {transaction.amount === 0 ? "—" : `${credit ? "+" : "-"}${formatPaise(transaction.amount)}`}
        </span>
        <span className="mt-0.5 block text-[11px] text-stone">
          {isMilestone
            ? "Milestone"
            : `${transaction.paymentMethod === "autopay" ? "Autopay" : "Balance"} · ${formatPaise(
                transaction.balanceAfter,
              )}`}
        </span>
      </span>

      {onOpen && <CaretRight size={14} className="shrink-0 text-stone" />}
    </>
  );

  if (!onOpen) {
    return <div className="flex items-center gap-3 px-3.5 py-3">{Inner}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(transaction)}
      className="focus-ring flex w-full items-center gap-3 rounded-lg px-3.5 py-3 text-left transition-colors hover:bg-surface-soft"
    >
      {Inner}
    </button>
  );
}
