import { transactionJson, walletJson } from "../utils/serialize.js";
import { cycleLabel } from "./clock.js";

/* ----------------------------------------------------------------------------
   Receipts.

   Every money-moving route answers with this object, whether it charged a
   subscription, a bill or a store item. One shape means the payment sheet has
   exactly one success screen, and the receipt the user sees is assembled from
   the same immutable row that the activity feed will show later — the balance
   after the charge is read back off the transaction, never recomputed on the
   client.
   -------------------------------------------------------------------------- */

const METHOD_LABELS = {
  balance: "Wealthify balance",
  upi: "UPI",
  card: "Card",
  autopay: "Autopay",
  system: "Direct credit",
};

export function methodLabel(method) {
  return METHOD_LABELS[method] ?? "Wealthify balance";
}

/* `wallet` is optional on purpose. A receipt opened days after the fact should
   show the balance that resulted from *that* payment — which the row already
   carries as `balanceAfter` — not the user's balance right now, so the receipt
   detail route deliberately sends no wallet. */
export function buildReceipt({ transaction, wallet, user, cycle, extra = {} }) {
  const base = transactionJson(transaction, { receipt: true });

  return {
    ...base,
    methodLabel: methodLabel(transaction.paymentMethod),
    simDate: cycleLabel(user, cycle ?? transaction.simCycle ?? 0),
    wallet: wallet ? walletJson(wallet) : null,
    ...extra,
  };
}

/** Small shared view of the career card, used by the income and wallet routes. */
export function careerJson(user, career) {
  return {
    title: career.current.title,
    salaryPerCycle: career.current.salaryPerCycle,
    blurb: career.current.blurb,
    next: career.next
      ? {
          title: career.next.title,
          salaryPerCycle: career.next.salaryPerCycle,
          xpRequired: career.next.xpRequired,
        }
      : null,
    progressToNext: career.progressToNext,
  };
}
