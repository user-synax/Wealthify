import { Router } from "express";
import { Bill } from "../models/Bill.js";
import { requireAuth } from "../middleware/auth.js";
import { MAX_PAYMENT_PAISE } from "../config.js";
import { badRequest } from "../utils/http-error.js";
import { walletJson } from "../utils/serialize.js";
import { billAmounts, isDue } from "../services/bills.js";
import { syncEconomy } from "../services/economy.js";
import { buildReceipt } from "../services/receipts.js";
import { transferBetweenAccounts } from "../services/ledger.js";

export const walletRouter = Router();
walletRouter.use(requireAuth);

const isIdempotencyKey = (value) =>
  typeof value === "string" && /^[\w:-]{8,120}$/.test(value);

/* GET /api/wallet
   The dashboard's single source of truth. It also runs the economy sync, so
   opening the app is what advances the simulated clock — the client never has
   to know that a payday or an autopay run happened, it just consumes the
   notices. */
walletRouter.get("/", async (req, res, next) => {
  try {
    const { wallet, cycle, notices, clock } = await syncEconomy(req.user);

    const bills = await Bill.find({ userId: req.user._id }).lean();
    const due = bills.filter((bill) => isDue(bill, cycle));
    const dueTotal = due.reduce((sum, bill) => sum + billAmounts(bill, cycle).total, 0);

    // Net worth folds investments in even though the market has not shipped:
    // `totalInvested` is real money that has left cash, so counting only cash
    // and savings would make the figure disagree with the ledger.
    return res.json({
      wallet: walletJson(wallet),
      clock,
      notices,
      bills: {
        dueCount: due.length,
        overdueCount: due.filter((bill) => billAmounts(bill, cycle).overdue).length,
        dueTotal,
      },
    });
  } catch (err) {
    return next(err);
  }
});

/* POST /api/wallet/transfer — move money between cash and savings.
   Amounts are integer paise; the client formats rupees. */
walletRouter.post("/transfer", async (req, res, next) => {
  try {
    const direction = req.body?.direction;
    const amount = req.body?.amount;
    const idempotencyKey = req.body?.idempotencyKey;

    if (direction !== "deposit" && direction !== "withdraw") {
      throw badRequest("INVALID_DIRECTION", {
        message: "Direction must be deposit or withdraw.",
      });
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      throw badRequest("INVALID_AMOUNT", { message: "Enter a whole rupee amount above zero." });
    }
    if (amount > MAX_PAYMENT_PAISE) {
      throw badRequest("AMOUNT_TOO_LARGE", { message: "That is larger than the simulator allows." });
    }
    if (!isIdempotencyKey(idempotencyKey)) {
      throw badRequest("IDEMPOTENCY_KEY_REQUIRED", {
        message: "A transfer must carry an idempotency key.",
      });
    }

    const { cycle } = await syncEconomy(req.user);
    const toSavings = direction === "deposit";

    const { transaction, wallet } = await transferBetweenAccounts({
      user: req.user,
      from: toSavings ? "cash" : "savings",
      to: toSavings ? "savings" : "cash",
      amount,
      idempotencyKey: `transfer:${req.user._id}:${idempotencyKey}`,
      simCycle: cycle,
      description: toSavings ? "Moved to savings" : "Move back to cash",
    });

    return res.status(201).json({
      receipt: buildReceipt({
        transaction,
        wallet,
        user: req.user,
        cycle,
        extra: {
          merchant: toSavings ? "Your savings account" : "Your wallet",
          items: [
            {
              label: toSavings ? "Cash → Savings" : "Savings → Cash",
              amount,
            },
          ],
          note: toSavings
            ? "Kept aside, still yours, out of the way."
            : "Back in your spendable balance.",
        },
      }),
      netWorth: wallet.cashBalance + wallet.savingsBalance + wallet.totalInvested,
    });
  } catch (err) {
    return next(err);
  }
});
