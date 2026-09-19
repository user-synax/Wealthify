import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/auth.js";
import { publicUser } from "../utils/jwt.js";
import { setPaymentPin } from "../services/payments.js";

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);

/* The PIN routes are the one place a 4-digit secret can be attacked directly,
   so they get a much tighter ceiling than the rest of the API. This sits
   alongside the per-account attempt counter in services/payments.js: the
   counter survives an attacker rotating IPs, the limiter survives one IP
   grinding many accounts. */
const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many PIN attempts. Try again later." } },
});

/* GET /api/payments/methods — what checkout may offer.
   The methods are simulated, so this exists to keep the labels and ordering in
   one place rather than hardcoding copy in the payment sheet. */
paymentsRouter.get("/methods", (req, res) => {
  res.json({
    methods: [
      {
        id: "balance",
        label: "Wealthify balance",
        hint: "Instant. Comes straight out of your available cash.",
        icon: "Wallet",
      },
      {
        id: "upi",
        label: "UPI",
        hint: "Simulated UPI collect request to your virtual handle.",
        icon: "QrCode",
      },
      {
        id: "card",
        label: "Debit card",
        hint: "Simulated card on file ending 4417.",
        icon: "CreditCard",
      },
    ],
    pin: { hasPin: Boolean(req.user.paymentPinSet), length: 4 },
    user: publicUser(req.user),
  });
});

/* POST /api/payments/pin — create the PIN, or change an existing one.
   Creating it needs no current PIN (there isn't one); changing it does. That
   asymmetry is the whole guard against a session hijack silently rebinding the
   payment credential. */
paymentsRouter.post("/pin", pinLimiter, async (req, res, next) => {
  try {
    const result = await setPaymentPin(req.user, {
      pin: req.body?.pin,
      currentPin: req.body?.currentPin,
    });
    return res.status(200).json({ pin: result, user: publicUser(req.user) });
  } catch (err) {
    return next(err);
  }
});

/* GET /api/payments/status — the minimum checkout needs before its first step.
   Kept deliberately tiny: the payment sheet calls this on open to decide
   whether to show the "create your PIN" step, and it must not leak a balance. */
paymentsRouter.get("/status", (req, res) => {
  res.json({
    hasPin: Boolean(req.user.paymentPinSet),
    locked: Boolean(req.user.pinLockedUntil && req.user.pinLockedUntil.getTime() > Date.now()),
    lockedUntil: req.user.pinLockedUntil?.toISOString() ?? null,
  });
});
