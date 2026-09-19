import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { STARTING_CASH_PAISE } from "../config.js";
import { User } from "../models/User.js";
import { Wallet } from "../models/Wallet.js";
import { Bill } from "../models/Bill.js";
import { Transaction } from "../models/Transaction.js";
import { STARTER_BILLS } from "../data/expenses.js";
import { makeReference } from "../services/ledger.js";
import { clockJson } from "../services/clock.js";
import { requireAuth } from "../middleware/auth.js";
import {
  clearAuthCookie,
  publicUser,
  setAuthCookie,
  signToken,
} from "../utils/jwt.js";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
authRouter.use(authLimiter);

const USERNAME_RE = /^[a-zA-Z0-9_]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fieldError(res, fields) {
  return res.status(400).json({ error: { code: "VALIDATION_ERROR", fields } });
}

function toWalletJson(wallet) {
  return {
    cashBalance: wallet.cashBalance,
    savingsBalance: wallet.savingsBalance,
    totalEarned: wallet.totalEarned,
    totalSpent: wallet.totalSpent,
    totalInvested: wallet.totalInvested,
    netWorth: wallet.cashBalance + wallet.savingsBalance + wallet.totalInvested,
  };
}

/* Login and /me both answer with the same session snapshot, so the client's
   auth provider has exactly one shape to store no matter how it got there. */
async function accountSnapshot(user) {
  const wallet = await Wallet.findOne({ userId: user._id }).lean();
  return {
    wallet: wallet ? toWalletJson(wallet) : null,
    clock: clockJson(user),
  };
}

function validateSignup({ username, email, password }) {
  const fields = {};
  if (typeof username !== "string" || username.trim().length < 3 || username.trim().length > 20) {
    fields.username = "Username must be 3-20 characters.";
  } else if (!USERNAME_RE.test(username.trim())) {
    fields.username = "Username may only contain letters, numbers and underscore.";
  }
  if (typeof email !== "string" || email.trim().length === 0 || email.trim().length > 254) {
    fields.email = "Email is required.";
  } else if (!EMAIL_RE.test(email.trim().toLowerCase())) {
    fields.email = "Enter a valid email address.";
  }
  if (typeof password !== "string" || password.length < 8) {
    fields.password = "Password must be at least 8 characters.";
  } else if (password.length > 128) {
    fields.password = "Password must be under 128 characters.";
  }
  return fields;
}

/* A new account opens with a wallet, the immutable signup-bonus entry, and a
   full starter month of bills already due. Seeding the bills here rather than
   lazily on first read means the ledger and the bill list are created in the
   same breath as the user, so there is no window where an account exists
   without its expenses. */
async function openAccount(user) {
  const wallet = await Wallet.create({
    userId: user._id,
    cashBalance: STARTING_CASH_PAISE,
    savingsBalance: 0,
    totalEarned: STARTING_CASH_PAISE,
    totalSpent: 0,
    totalInvested: 0,
    /* Salary is credited when a cycle *rolls over*, so the first payday is at
       the end of month one. Starting this at 0 is what stops the signup bonus
       and a salary from landing in the same breath. */
    lastSalaryCycle: 0,
  });

  await Transaction.create({
    userId: user._id,
    type: "reward",
    direction: "credit",
    amount: STARTING_CASH_PAISE,
    category: "signup_bonus",
    description: "Welcome bonus",
    paymentMethod: "system",
    status: "completed",
    reference: makeReference(),
    balanceBefore: 0,
    balanceAfter: STARTING_CASH_PAISE,
    simCycle: 0,
    metadata: {
      icon: "Gift",
      merchant: "Wealthify",
      note: "Starting balance. Now go and earn the rest.",
    },
  });

  await Bill.insertMany(
    STARTER_BILLS.map((bill) => ({
      userId: user._id,
      key: bill.key,
      name: bill.name,
      category: bill.category,
      icon: bill.icon,
      amount: bill.amount,
      note: bill.note,
      // `lastPaidCycle: -1` is what makes month one due immediately.
      dueCycle: 0,
      lastPaidCycle: -1,
      autopay: Boolean(bill.autopay),
      source: "starter",
    })),
  );

  return wallet;
}

// POST /api/auth/signup — creates user + wallet + signup-bonus transaction.
authRouter.post("/signup", async (req, res, next) => {
  try {
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = req.body?.password;

    const fields = validateSignup({ username, email, password });
    if (Object.keys(fields).length > 0) return fieldError(res, fields);

    const existing = await User.findOne({
      $or: [{ email }, { username }],
    }).lean();
    if (existing) {
      const taken = {};
      if (existing.email === email) taken.email = "An account with this email already exists.";
      if (existing.username === username) taken.username = "This username is taken.";
      return res.status(409).json({ error: { code: "ALREADY_EXISTS", fields: taken } });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();
    const user = await User.create({
      username,
      email,
      passwordHash,
      simStartedAt: now,
      lastCycleAt: now,
      cycle: 0,
    });

    const wallet = await openAccount(user);

    setAuthCookie(res, signToken(user._id));
    return res.status(201).json({
      user: publicUser(user),
      wallet: toWalletJson(wallet),
      clock: clockJson(user),
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: { code: "ALREADY_EXISTS" } });
    }
    return next(err);
  }
});

// POST /api/auth/login — accepts email or username as `identifier`.
authRouter.post("/login", async (req, res, next) => {
  try {
    const identifier =
      typeof req.body?.identifier === "string"
        ? req.body.identifier.trim()
        : typeof req.body?.email === "string"
          ? req.body.email.trim()
          : "";
    const password = req.body?.password;

    if (!identifier || typeof password !== "string" || password.length === 0) {
      return fieldError(res, { identifier: "Email/username and password are required." });
    }

    const lookup = identifier.toLowerCase();
    const user = await User.findOne({
      $or: [{ email: lookup }, { username: identifier }],
    }).select("+passwordHash");

    // Generic message either way so accounts cannot be enumerated.
    if (!user) {
      return res.status(401).json({ error: { code: "INVALID_CREDENTIALS" } });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: { code: "INVALID_CREDENTIALS" } });
    }

    setAuthCookie(res, signToken(user._id));
    return res.json({
      user: publicUser(user),
      ...(await accountSnapshot(user)),
    });
  } catch (err) {
    return next(err);
  }
});

authRouter.post("/logout", (req, res) => {
  clearAuthCookie(res);
  return res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    return res.json({ user: publicUser(req.user), ...(await accountSnapshot(req.user)) });
  } catch (err) {
    return next(err);
  }
});
