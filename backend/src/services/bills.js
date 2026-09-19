import {
  BILL_CATEGORIES,
  LATE_FEE_PCT,
  MAX_OVERDUE_CYCLES,
} from "../data/expenses.js";
import { shortCycleLabel } from "./clock.js";

/* ----------------------------------------------------------------------------
   Bill arithmetic.

   A bill stores the cycle it was last settled for, not a next-due date, so
   "how much do I owe" is derived rather than remembered. That makes arrears
   fall out of the simulation for free: a user who disappears for four cycles
   comes back to four months of rent as a single, correct figure, and paying it
   clears all four at once exactly like settling up with a landlord.

   Late fees accrue on the overdue portion only, and stop after
   MAX_OVERDUE_CYCLES so a bad patch is recoverable instead of a spiral.
   -------------------------------------------------------------------------- */

/** Unpaid cycles for a bill. 0 means settled for the current cycle. */
export function pendingCycles(bill, cycle) {
  return Math.max(0, cycle - bill.lastPaidCycle);
}

export function isDue(bill, cycle) {
  return cycle >= bill.dueCycle && pendingCycles(bill, cycle) > 0;
}

export function billAmounts(bill, cycle) {
  const pending = pendingCycles(bill, cycle);
  const base = bill.amount * pending;
  const overdueCycles = Math.min(Math.max(pending - 1, 0), MAX_OVERDUE_CYCLES);
  const lateFee = Math.round((bill.amount * LATE_FEE_PCT * overdueCycles) / 100);

  return {
    pending,
    base,
    lateFee,
    total: base + lateFee,
    overdue: pending > 1,
    overdueCycles,
    lateFeePct: LATE_FEE_PCT,
  };
}

/** `user` is needed only so the period label can be expressed on their clock. */
export function billJson(bill, cycle, user) {
  const amounts = billAmounts(bill, cycle);
  const due = isDue(bill, cycle);

  return {
    id: String(bill._id),
    key: bill.key,
    name: bill.name,
    category: bill.category,
    categoryLabel: BILL_CATEGORIES[bill.category]?.label ?? "Other",
    icon: bill.icon,
    note: bill.note,
    amount: bill.amount,
    autopay: bill.autopay,
    source: bill.source,
    due,
    ...amounts,
    periodLabel: due ? shortCycleLabel(user, cycle) : null,
    autopayFailed: bill.lastAutopayFailureCycle === cycle,
  };
}
