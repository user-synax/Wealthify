import crypto from "node:crypto";
import { Wallet } from "../models/Wallet.js";
import { Transaction } from "../models/Transaction.js";
import { badRequest, conflict, paymentRequired } from "../utils/http-error.js";

/* ----------------------------------------------------------------------------
   The only writer of money in the simulator.

   A settled entry is produced in three steps, and the order is deliberate:

     1. insert a `pending` transaction, keyed on (userId, idempotencyKey)
     2. atomically move the wallet with a single conditional `$inc`
     3. mark the row `completed` with the resulting balances

   Step 2 is the safety-critical one. The funds check lives in the *filter*, not
   in a prior read, so two simultaneous payments cannot both observe the same
   balance and both pass — MongoDB applies exactly one of them and the loser
   gets `null` back. Mongoose validators are bypassed by `$inc`, which is why
   the check must be in the query and not in JavaScript.

   The whole thing needs no multi-document transaction, which matters because a
   single-node MongoDB has no replica set to run one on. What replaces it is a
   compensating reversal: if step 3 fails after step 2 moved real money, the
   ledger puts the money back and records the attempt as failed. A crash
   *between* steps leaves a `pending` row plus a moved balance, which is why
   replayed keys are resolved from the row itself rather than from the wallet.

   idempotencyKey is optional for internal credits (nothing to replay) and
   required by every route a client can retry.
   -------------------------------------------------------------------------- */

const MAX_REFERENCE_ATTEMPTS = 5;

export function makeReference() {
  // Crockford-ish base32, no vowels, no look-alike characters: a reference the
  // user can read off a receipt and retype without ambiguity.
  const alphabet = "0123456789BCDFGHJKLMNPQRSTVWXYZ";
  const bytes = crypto.randomBytes(10);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return `WFL-${out.slice(0, 4)}-${out.slice(4, 10)}`;
}

/** Paise as the client renders them. Only ever used in error details. */
export function summarize({ available, required }) {
  return { available, required, shortfall: Math.max(0, required - available) };
}

export async function getWallet(userId) {
  const wallet = await Wallet.findOne({ userId });
  if (!wallet) throw conflict("WALLET_MISSING", { message: "No wallet for this account." });
  return wallet;
}

function buildMovements({ account, direction, amount, affectsTotals }) {
  const balanceField = account === "savings" ? "savingsBalance" : "cashBalance";
  const sign = direction === "debit" ? -1 : 1;

  const inc = { [balanceField]: sign * amount };
  if (direction === "credit" && affectsTotals === "earned") inc.totalEarned = amount;
  if (direction === "debit" && affectsTotals === "spent") inc.totalSpent = amount;

  return { balanceField, sign, inc };
}

/**
 * Post one immutable money movement.
 *
 * @returns {{ transaction: object, wallet: object, replay: boolean }}
 */
export async function postEntry({
  user,
  type,
  category,
  amount,
  direction,
  account = "cash",
  description = "",
  paymentMethod = "balance",
  idempotencyKey,
  metadata = {},
  affectsTotals,
  allowOverdraft = false,
  simCycle = 0,
}) {
  const userId = user._id;

  if (!Number.isInteger(amount) || amount < 0) {
    throw badRequest("INVALID_AMOUNT", { message: "Amount must be a whole number of paise." });
  }

  const totals =
    affectsTotals ??
    (type === "expense" || (type === "investment" && direction === "debit")
      ? "spent"
      : type === "income" || type === "reward"
        ? "earned"
        : "none");

  /* -- Replay / duplicate guard ------------------------------------------- */
  if (idempotencyKey) {
    const existing = await Transaction.findOne({ userId, idempotencyKey });
    if (existing) {
      if (existing.status === "completed") {
        return { transaction: existing, wallet: await getWallet(userId), replay: true };
      }
      if (existing.status === "failed") {
        throw paymentRequired("PAYMENT_ALREADY_FAILED", {
          message: "This payment attempt already failed. Start a new one.",
          details: { reference: existing.reference, reason: existing.failureReason },
        });
      }
      // A duplicate arrived while the original was still mid-flight. The
      // client should wait for the first response rather than being told a
      // second time that its money is gone.
      throw conflict("PAYMENT_IN_FLIGHT", { message: "This payment is still being processed." });
    }
  }

  /* -- Step 1: reserve the row -------------------------------------------- */
  let transaction;
  const base = {
    userId,
    type,
    direction,
    amount,
    category,
    description,
    paymentMethod,
    idempotencyKey,
    simCycle,
    metadata,
    status: "pending",
    // Filled in once the wallet move is known. If the process dies here these
    // values stay at 0 and the row is visibly incomplete rather than wrong.
    balanceBefore: 0,
    balanceAfter: 0,
  };

  for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt += 1) {
    try {
      transaction = await Transaction.create({ ...base, reference: makeReference() });
      break;
    } catch (err) {
      if (err?.code !== 11000) throw err;
      // Either the idempotency key collided (a genuine replay that raced us
      // here) or two references landed on the same value. Tell them apart.
      if (idempotencyKey) {
        const racing = await Transaction.findOne({ userId, idempotencyKey });
        if (racing?.status === "completed") {
          return { transaction: racing, wallet: await getWallet(userId), replay: true };
        }
        if (racing) {
          throw conflict("PAYMENT_IN_FLIGHT", { message: "This payment is still being processed." });
        }
      }
    }
  }
  if (!transaction) {
    throw new Error("Could not allocate a unique payment reference.");
  }

  /* -- Step 2: move the wallet atomically --------------------------------- */
  let wallet;
  try {
    const { balanceField, sign, inc } = buildMovements({
      account,
      direction,
      amount,
      affectsTotals: totals,
    });

    const filter = { userId };
    // Every debit is funds-guarded unless the caller explicitly opts out (or
    // is posting a zero-amount informational entry, where `$gte: 0` is always
    // true anyway). The guard lives in the query so a concurrent payment
    // cannot slip between the check and the write.
    if (direction === "debit" && !allowOverdraft) {
      filter[balanceField] = { $gte: amount };
    }

    wallet = await Wallet.findOneAndUpdate(filter, { $inc: inc }, { new: true });
    if (!wallet) {
      const current = await Wallet.findOne({ userId }).lean();
      const available = current?.[balanceField] ?? 0;
      await Transaction.updateOne(
        { _id: transaction._id },
        {
          status: "failed",
          failureReason: "INSUFFICIENT_FUNDS",
          metadata: { ...metadata, ...summarize({ available, required: amount }) },
        },
      );
      throw paymentRequired("INSUFFICIENT_FUNDS", {
        message:
          account === "savings"
            ? "Not enough in savings for this."
            : "Not enough available balance for this payment.",
        details: { ...summarize({ available, required: amount }), account },
      });
    }

    /* -- Step 3: settle the row ------------------------------------------- */
    const balanceAfter = wallet[balanceField];
    const balanceBefore = balanceAfter - sign * amount;

    try {
      transaction = await Transaction.findByIdAndUpdate(
        transaction._id,
        { status: "completed", balanceBefore, balanceAfter },
        { new: true },
      );
    } catch (settleErr) {
      // Money moved but the record of it did not land. Reverse the movement so
      // the balance always matches the ledger, then mark the row failed.
      await Wallet.updateOne(
        { userId },
        { $inc: { [balanceField]: -sign * amount, ...(totals === "earned" ? { totalEarned: -amount } : {}), ...(totals === "spent" ? { totalSpent: -amount } : {}) } },
      );
      await Transaction.updateOne(
        { _id: transaction._id },
        { status: "failed", failureReason: "LEDGER_WRITE_FAILED" },
      );
      throw settleErr;
    }

    return { transaction, wallet, replay: false };
  } catch (err) {
    if (err?.code === "INSUFFICIENT_FUNDS" || err?.status) throw err;
    // Anything else after the reservation: leave a failed row behind rather
    // than a pending one that a replay would keep waiting on.
    await Transaction.updateOne(
      { _id: transaction._id, status: "pending" },
      { status: "failed", failureReason: "LEDGER_ERROR" },
    );
    throw err;
  }
}

/* Internal account-to-account move (cash <-> savings). One document, one
   update, so nothing can be created or lost in between. */
export async function transferBetweenAccounts({
  user,
  from,
  to,
  amount,
  idempotencyKey,
  simCycle = 0,
  description = "",
}) {
  const userId = user._id;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw badRequest("INVALID_AMOUNT", { message: "Enter a whole rupee amount above zero." });
  }
  if (from === to) {
    throw badRequest("SAME_ACCOUNT", { message: "Choose two different accounts." });
  }

  const toSavings = to === "savings";
  const fromField = toSavings ? "cashBalance" : "savingsBalance";
  const toField = toSavings ? "savingsBalance" : "cashBalance";

  const existing = await Transaction.findOne({ userId, idempotencyKey });
  if (existing?.status === "completed") {
    return { transaction: existing, wallet: await getWallet(userId), replay: true };
  }

  const transaction = await Transaction.create({
    userId,
    type: "transfer",
    direction: toSavings ? "debit" : "credit",
    amount,
    category: toSavings ? "savings_deposit" : "savings_withdrawal",
    description,
    paymentMethod: "balance",
    idempotencyKey,
    simCycle,
    status: "pending",
    reference: makeReference(),
    balanceBefore: 0,
    balanceAfter: 0,
  });

  const wallet = await Wallet.findOneAndUpdate(
    { userId, [fromField]: { $gte: amount } },
    { $inc: { [fromField]: -amount, [toField]: amount } },
    { new: true },
  );

  if (!wallet) {
    const current = await Wallet.findOne({ userId }).lean();
    const available = current?.[fromField] ?? 0;
    await Transaction.updateOne(
      { _id: transaction._id },
      { status: "failed", failureReason: "INSUFFICIENT_FUNDS" },
    );
    throw paymentRequired("INSUFFICIENT_FUNDS", {
      message: toSavings ? "Not enough cash to move that much." : "Not enough savings to withdraw that.",
      details: { ...summarize({ available, required: amount }), account: toSavings ? "cash" : "savings" },
    });
  }

  const balanceAfter = wallet.cashBalance;
  const settled = await Transaction.findByIdAndUpdate(
    transaction._id,
    {
      status: "completed",
      balanceBefore: balanceAfter + (toSavings ? amount : -amount),
      balanceAfter,
    },
    { new: true },
  );

  return { transaction: settled, wallet, replay: false };
}
