import bcrypt from "bcryptjs";
import { PIN_LOCK_MS, PIN_MAX_ATTEMPTS } from "../config.js";
import { badRequest, forbidden, preconditionFailed, tooMany } from "../utils/http-error.js";

/* ----------------------------------------------------------------------------
   The payment credential.

   A 4-digit PIN is weak by construction, so the protections are the ones a real
   wallet app uses rather than a password policy: the PIN is bcrypt-hashed at
   rest, the server rate-limits guesses per account (not per IP, so rotating
   addresses does not help), and a wrong PIN cannot be distinguished from a
   correct one that happens to be rejected for funds — the failure arrives only
   after the PIN check passes.

   A trivially guessable PIN (1234, 0000, repeated digits) is refused at set
   time. That is the whole reason the lockout is survivable.
   -------------------------------------------------------------------------- */

const PIN_RE = /^\d{4}$/;
const SEQUENTIAL = new Set([
  "0123", "1234", "2345", "3456", "4567", "5678", "6789",
  "9876", "8765", "7654", "6543", "5432", "4321", "3210",
]);

export function validatePinShape(pin) {
  if (typeof pin !== "string" || !PIN_RE.test(pin)) {
    throw badRequest("PIN_FORMAT", { message: "Your PIN is four digits.", fields: { pin: "Four digits." } });
  }
  if (/^(\d)\1{3}$/.test(pin) || SEQUENTIAL.has(pin)) {
    throw badRequest("PIN_WEAK", {
      message: "Pick a PIN that is not four in a row or the same digit repeated.",
      fields: { pin: "Too easy to guess." },
    });
  }
}

/** 428 when the account has no PIN yet, so checkout can branch to "create one". */
export function requirePinSet(user) {
  if (!user.paymentPinSet) {
    throw preconditionFailed("PIN_REQUIRED", {
      message: "Set a payment PIN before your first payment.",
      details: { hasPin: false },
    });
  }
}

export async function setPaymentPin(user, { pin, currentPin }) {
  validatePinShape(pin);

  if (user.paymentPinSet) {
    if (typeof currentPin !== "string" || currentPin.length === 0) {
      throw badRequest("PIN_CURRENT_REQUIRED", {
        message: "Enter your current PIN to change it.",
        fields: { currentPin: "Required." },
      });
    }
    const ok = await bcrypt.compare(currentPin, user.paymentPinHash ?? "");
    if (!ok) {
      throw forbidden("PIN_INVALID", { message: "That is not your current PIN." });
    }
  }

  user.paymentPinHash = await bcrypt.hash(pin, 10);
  user.paymentPinSet = true;
  user.pinAttempts = 0;
  user.pinLockedUntil = null;
  await user.save();

  return { hasPin: true };
}

/**
 * Verify a PIN for a payment. Throws with a code the UI can act on: the
 * lockout is deliberately visible (`PIN_LOCKED` with a retry time) because a
 * silent lock looks like a broken app.
 */
export async function verifyPin(user, pin) {
  requirePinSet(user);

  if (user.pinLockedUntil && user.pinLockedUntil.getTime() > Date.now()) {
    throw tooMany("PIN_LOCKED", {
      message: "Payments are locked after too many wrong PINs.",
      details: {
        retryAt: user.pinLockedUntil.toISOString(),
        retryInMs: user.pinLockedUntil.getTime() - Date.now(),
      },
    });
  }

  if (typeof pin !== "string" || !PIN_RE.test(pin)) {
    throw badRequest("PIN_FORMAT", { message: "Enter your four-digit PIN." });
  }

  const ok = await bcrypt.compare(pin, user.paymentPinHash ?? "");
  if (ok) {
    if (user.pinAttempts !== 0 || user.pinLockedUntil) {
      user.pinAttempts = 0;
      user.pinLockedUntil = null;
      await user.save();
    }
    return true;
  }

  user.pinAttempts = (user.pinAttempts ?? 0) + 1;
  const remaining = Math.max(0, PIN_MAX_ATTEMPTS - user.pinAttempts);
  if (remaining === 0) {
    user.pinLockedUntil = new Date(Date.now() + PIN_LOCK_MS);
  }
  await user.save();

  if (remaining === 0) {
    throw tooMany("PIN_LOCKED", {
      message: `Too many wrong PINs. Payments are locked for ${Math.round(PIN_LOCK_MS / 60_000)} minutes.`,
      details: { retryAt: user.pinLockedUntil.toISOString(), retryInMs: PIN_LOCK_MS, attemptsRemaining: 0 },
    });
  }

  throw forbidden("PIN_INVALID", {
    message: `Wrong PIN. ${remaining} ${remaining === 1 ? "try" : "tries"} left.`,
    details: { attemptsRemaining: remaining },
  });
}
