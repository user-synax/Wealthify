import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { STARTING_CASH_PAISE } from "../config.js";
import { User } from "../models/User.js";
import { Wallet } from "../models/Wallet.js";
import { Transaction } from "../models/Transaction.js";
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

function toWalletJson(wallet) {
  return {
    cashBalance: wallet.cashBalance,
    savingsBalance: wallet.savingsBalance,
    totalEarned: wallet.totalEarned,
    totalSpent: wallet.totalSpent,
    totalInvested: wallet.totalInvested,
  };
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
    const user = await User.create({ username, email, passwordHash });

    const wallet = await Wallet.create({
      userId: user._id,
      cashBalance: STARTING_CASH_PAISE,
      savingsBalance: 0,
      totalEarned: STARTING_CASH_PAISE,
      totalSpent: 0,
      totalInvested: 0,
    });

    await Transaction.create({
      userId: user._id,
      type: "reward",
      amount: STARTING_CASH_PAISE,
      category: "signup_bonus",
      description: "Welcome bonus",
      balanceBefore: 0,
      balanceAfter: STARTING_CASH_PAISE,
      metadata: { source: "signup" },
    });

    setAuthCookie(res, signToken(user._id));
    return res.status(201).json({ user: publicUser(user), wallet: toWalletJson(wallet) });
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

    const wallet = await Wallet.findOne({ userId: user._id }).lean();
    setAuthCookie(res, signToken(user._id));
    return res.json({
      user: publicUser(user),
      wallet: wallet ? toWalletJson(wallet) : null,
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
    const wallet = await Wallet.findOne({ userId: req.user._id }).lean();
    return res.json({
      user: publicUser(req.user),
      wallet: wallet ? toWalletJson(wallet) : null,
    });
  } catch (err) {
    return next(err);
  }
});
