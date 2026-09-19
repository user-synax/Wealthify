import { Router } from "express";
import rateLimit from "express-rate-limit";
import { Bill } from "../models/Bill.js";
import { requireAuth } from "../middleware/auth.js";
import { MAX_PAYMENT_PAISE } from "../config.js";
import { badRequest, notFound } from "../utils/http-error.js";
import { BILL_CATEGORIES } from "../data/expenses.js";
import { billAmounts, billJson, isDue } from "../services/bills.js";
import { postEntry } from "../services/ledger.js";
import { verifyPin } from "../services/payments.js";
import { awardXp, syncEconomy } from "../services/economy.js";
import { buildReceipt } from "../services/receipts.js";

export const expensesRouter = Router();
expensesRouter.use(requireAuth);

const payLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Slow down a moment." } },
});

const isIdempotencyKey = (value) =>
  typeof value === "string" && /^[\w:-]{8,120}$/.test(value);

const PAYMENT_METHODS = new Set(["balance", "upi", "card"]);

async function loadBills(userId) {
  return Bill.find({ userId }).sort({ category: 1, name: 1 });
}

/* GET /api/expenses — every bill with its due-ness already resolved.
   The client never does the due-date arithmetic; it renders `due`, `pending`
   and `total` exactly as the server computed them, so the number on the button
   is always the number the ledger will charge. */
expensesRouter.get("/", async (req, res, next) => {
  try {
    const { wallet, cycle, clock, notices } = await syncEconomy(req.user);
    const bills = await loadBills(req.user._id);

    const rows = bills.map((bill) => billJson(bill, cycle, req.user));
    const due = rows.filter((row) => row.due);

    const byCategory = {};
    for (const row of due) {
      const entry = (byCategory[row.category] ??= {
        category: row.category,
        label: row.categoryLabel,
        total: 0,
        count: 0,
      });
      entry.total += row.total;
      entry.count += 1;
    }

    return res.json({
      wallet,
      clock,
      notices,
      bills: rows,
      categories: Object.entries(BILL_CATEGORIES).map(([id, meta]) => ({ id, ...meta })),
      summary: {
        monthlyTotal: rows.reduce((sum, row) => sum + row.amount, 0),
        dueCount: due.length,
        dueTotal: due.reduce((sum, row) => sum + row.total, 0),
        overdueCount: due.filter((row) => row.overdue).length,
        lateFees: due.reduce((sum, row) => sum + row.lateFee, 0),
        autopayCount: rows.filter((row) => row.autopay).length,
        scheduledMonthly: rows.reduce((sum, row) => sum + row.amount, 0),
        byCategory: Object.values(byCategory),
      },
    });
  } catch (err) {
    return next(err);
  }
});

/* POST /api/expenses/bills/:id/pay
   Settles every unpaid cycle for the bill, plus any late fees, in one payment
   — arrears clear the way they do with a real landlord rather than one month
   at a time. */
expensesRouter.post("/bills/:id/pay", payLimiter, async (req, res, next) => {
  try {
    const paymentMethod = req.body?.paymentMethod ?? "balance";
    const pin = req.body?.pin;
    const idempotencyKey = req.body?.idempotencyKey;

    if (!PAYMENT_METHODS.has(paymentMethod)) {
      throw badRequest("INVALID_PAYMENT_METHOD", { message: "Choose a payment method." });
    }
    if (!isIdempotencyKey(idempotencyKey)) {
      throw badRequest("IDEMPOTENCY_KEY_REQUIRED", { message: "Missing idempotency key." });
    }

    const { cycle, clock } = await syncEconomy(req.user);

    const bill = await Bill.findOne({ _id: req.params.id, userId: req.user._id });
    if (!bill) throw notFound("BILL_NOT_FOUND", { message: "That bill is not on your account." });

    if (!isDue(bill, cycle)) {
      throw badRequest("BILL_NOT_DUE", { message: `${bill.name} is already settled for this month.` });
    }

    const amounts = billAmounts(bill, cycle);
    if (amounts.total > MAX_PAYMENT_PAISE) {
      throw badRequest("AMOUNT_TOO_LARGE", { message: "That is larger than the simulator allows." });
    }

    await verifyPin(req.user, pin);

    const { transaction, wallet, replay } = await postEntry({
      user: req.user,
      type: "expense",
      direction: "debit",
      amount: amounts.total,
      category: bill.category,
      description: bill.name,
      paymentMethod,
      // Keyed on the *target* cycle, so replaying the request returns the same
      // payment while paying next month produces a genuinely new charge.
      idempotencyKey: `bill:${req.user._id}:${bill.key}:${cycle}:${idempotencyKey}`,
      simCycle: cycle,
      metadata: {
        icon: bill.icon,
        merchant: bill.name,
        note: amounts.overdue
          ? `Settled ${amounts.pending} months plus a late fee.`
          : "Paid on time.",
        items: [
          { label: `${bill.name} × ${amounts.pending}`, amount: amounts.base },
          ...(amounts.lateFee
            ? [{ label: `Late fee (${amounts.lateFeePct}% × ${amounts.overdueCycles})`, amount: amounts.lateFee }]
            : []),
        ],
        billKey: bill.key,
        pending: amounts.pending,
      },
    });

    if (!replay) {
      bill.lastPaidCycle = cycle;
      bill.lastAutopayFailureCycle = null;
      await bill.save();
      // Paying on time is the behaviour the simulator should reward, so a bill
      // settled before it is overdue is worth more XP than arrears.
      awardXp(req.user, amounts.overdue ? 6 : 14);
      await req.user.save();
    }

    return res.status(201).json({
      receipt: buildReceipt({
        transaction,
        wallet,
        user: req.user,
        cycle,
        extra: {
          merchant: bill.name,
          note: amounts.overdue
            ? "Cleared, including the late fee. Turning autopay on avoids this next time."
            : "Paid on time.",
          overdue: amounts.overdue,
          level: req.user.level,
          xp: req.user.xp,
          replay,
        },
      }),
      clock,
      bill: billJson(bill, cycle, req.user),
    });
  } catch (err) {
    return next(err);
  }
});

/* PATCH /api/expenses/bills/:id — autopay is the only user-editable field;
   amounts are the simulator's business. */
expensesRouter.patch("/bills/:id", async (req, res, next) => {
  try {
    const autopay = req.body?.autopay;
    if (typeof autopay !== "boolean") {
      throw badRequest("INVALID_AUTOPAY", { message: "Send autopay as true or false." });
    }

    const { cycle } = await syncEconomy(req.user);
    const bill = await Bill.findOne({ _id: req.params.id, userId: req.user._id });
    if (!bill) throw notFound("BILL_NOT_FOUND", { message: "That bill is not on your account." });

    bill.autopay = autopay;
    if (autopay) bill.lastAutopayFailureCycle = null;
    await bill.save();

    return res.json({ bill: billJson(bill, cycle, req.user) });
  } catch (err) {
    return next(err);
  }
});
