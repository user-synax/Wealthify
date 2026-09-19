import { Bill } from "../models/Bill.js";
import { careerFor, resolveCareer } from "../data/income.js";
import { MAX_CATCHUP_CYCLES, clockJson, currentCycle } from "./clock.js";
import { billAmounts, isDue } from "./bills.js";
import { getWallet, postEntry } from "./ledger.js";

/* ----------------------------------------------------------------------------
   Economy sync.

   Everything time-driven happens here and only here: when a new simulated
   cycle begins this credits salary, promotes the career if the XP gate has
   been cleared, resets the per-cycle gig allowance, and then runs autopay over
   whatever is due.

   It is called at the top of every economy route and is written to be safe to
   call as often as you like. Nothing is "scheduled": the cycle counter is
   compared against the cached value, and each side effect carries an
   idempotency key derived from the cycle, so a sync that races another sync
   cannot pay a salary or charge a bill twice.

   Order matters. Salary lands before autopay so a user who has just returned
   is not marked as failing to pay from a balance that was about to be topped
   up by their own paycheque.
   -------------------------------------------------------------------------- */

export const XP_PER_LEVEL = 500;

export function levelForXp(xp) {
  return 1 + Math.floor(Math.max(0, xp) / XP_PER_LEVEL);
}

/**
 * Credit XP and keep the level in step. Returns true when a level was crossed
 * so a route can turn it into a notice rather than the client having to diff
 * levels across responses.
 */
export function awardXp(user, amount) {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const before = user.level ?? levelForXp(user.xp);
  user.xp += Math.round(amount);
  user.level = levelForXp(user.xp);
  return user.level > before;
}

async function advanceCycle(user, wallet, now) {
  const notices = [];
  const cycle = currentCycle(user, now);
  if (cycle <= user.cycle) return { notices, cycle, advanced: false };

  const previous = user.cycle;
  user.cycle = cycle;
  user.lastCycleAt = new Date(now);
  user.gigsThisCycle = 0;

  /* --- Payday ------------------------------------------------------------ */
  const claimable = Math.min(cycle, wallet.lastSalaryCycle + MAX_CATCHUP_CYCLES);
  const cyclesPaid = Math.max(0, claimable - wallet.lastSalaryCycle);

  if (cyclesPaid > 0) {
    const career = careerFor(user.career);
    const gross = career.salaryPerCycle * cyclesPaid;
    const { transaction, wallet: updated } = await postEntry({
      user,
      type: "income",
      direction: "credit",
      amount: gross,
      category: "salary",
      description:
        cyclesPaid === 1
          ? `Salary credited — ${career.title}`
          : `Salary credited — ${career.title} (${cyclesPaid} months)`,
      paymentMethod: "system",
      idempotencyKey: `salary:${user._id}:${claimable}`,
      simCycle: cycle,
      metadata: {
        icon: "Bank",
        merchant: "Wealthify Payroll",
        cyclesPaid,
        monthly: career.salaryPerCycle,
      },
    });
    wallet.lastSalaryCycle = claimable;
    notices.push({
      kind: "salary",
      tone: "credit",
      title: "Salary credited",
      body: `${career.title} pay for ${cyclesPaid === 1 ? "this month" : `${cyclesPaid} months`} has landed in your account.`,
      amount: gross,
      transactionId: String(transaction._id),
      reference: transaction.reference,
      wallet: updated,
    });
  }

  /* --- Promotion --------------------------------------------------------- */
  const career = resolveCareer({ career: user.career, xp: user.xp });
  if (career.promoted) {
    const from = user.career;
    user.career = career.current.title;
    const { transaction } = await postEntry({
      user,
      type: "career",
      direction: "credit",
      amount: 0,
      category: "promotion",
      description: `Promoted to ${career.current.title}`,
      paymentMethod: "system",
      affectsTotals: "none",
      idempotencyKey: `promotion:${user._id}:${career.current.title}`,
      simCycle: cycle,
      metadata: {
        icon: "TrendUp",
        note: `New monthly salary: ₹${Math.round(career.current.salaryPerCycle / 100).toLocaleString("en-IN")}`,
        from,
        to: career.current.title,
      },
    });
    notices.push({
      kind: "promotion",
      tone: "milestone",
      title: `Promoted to ${career.current.title}`,
      body: career.current.blurb,
      transactionId: String(transaction._id),
      reference: transaction.reference,
    });
  }

  /* --- Autopay ----------------------------------------------------------- */
  const autopayNotices = await settleAutopay(user, wallet, cycle);
  notices.push(...autopayNotices);

  void previous;
  return { notices, cycle, advanced: true };
}

/**
 * Collect every autopay bill that is due. A failure is recorded on the bill
 * rather than thrown: one unaffordable subscription must not stop the others
 * from being charged, and the user should come back to a list that explains
 * exactly which one bounced.
 */
export async function settleAutopay(user, wallet, cycle) {
  const notices = [];
  const bills = await Bill.find({ userId: user._id, autopay: true });
  if (bills.length === 0) return notices;

  for (const bill of bills) {
    if (!isDue(bill, cycle)) continue;

    const amounts = billAmounts(bill, cycle);
    try {
      const { transaction, wallet: updated } = await postEntry({
        user,
        type: "expense",
        direction: "debit",
        amount: amounts.total,
        category: bill.category,
        description: bill.name,
        paymentMethod: "autopay",
        idempotencyKey: `autopay:${user._id}:${bill.key}:${cycle}`,
        simCycle: cycle,
        metadata: {
          icon: bill.icon,
          merchant: bill.name,
          note: "Collected automatically on autopay.",
          items: [
            { label: `${bill.name} × ${amounts.pending}`, amount: amounts.base },
            ...(amounts.lateFee ? [{ label: "Late fee", amount: amounts.lateFee }] : []),
          ],
        },
      });
      bill.lastPaidCycle = cycle;
      bill.lastAutopayFailureCycle = null;
      await bill.save();
      void updated;
      notices.push({
        kind: "autopay",
        tone: "debit",
        title: `${bill.name} paid automatically`,
        body: "Autopay collected this cycle's bill.",
        amount: amounts.total,
        transactionId: String(transaction._id),
        reference: transaction.reference,
      });
    } catch (err) {
      if (err?.code === "INSUFFICIENT_FUNDS") {
        bill.lastAutopayFailureCycle = cycle;
        await bill.save();
        notices.push({
          kind: "autopay_failed",
          tone: "warning",
          title: `${bill.name} could not be collected`,
          body: `Autopay needs ₹${Math.round(amounts.total / 100).toLocaleString("en-IN")} and the balance is short. Pay it manually or turn autopay off.`,
          amount: amounts.total,
          shortfall: err.details?.shortfall ?? 0,
        });
        continue;
      }
      throw err;
    }
  }

  return notices;
}

/**
 * Bring a user's simulated clock up to date. Returns the live wallet plus any
 * notices the UI should surface, and always leaves the wallet in sync with
 * whatever the ledger did.
 */
export async function syncEconomy(user, { now = Date.now() } = {}) {
  let wallet = await getWallet(user._id);
  const { notices, cycle } = await advanceCycle(user, wallet, now);

  // The user document changed (cycle, career, streak counters) whenever a
  // cycle rolled over; persist before anyone serialises it.
  if (user.isModified()) await user.save();

  // Re-read rather than trusting the pre-autopay snapshot: autopay may have
  // moved money in the meantime and the response must show the post-payment
  // balance.
  wallet = (await getWallet(user._id)).toObject();

  return { wallet, cycle, notices, clock: clockJson(user, { cycle, now }) };
}
