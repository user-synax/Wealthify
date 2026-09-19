import jwt from "jsonwebtoken";
import {
  AUTH_COOKIE_MAX_AGE_MS,
  AUTH_COOKIE_NAME,
  config,
} from "../config.js";

export function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

function baseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd,
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
  };
}

export function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, baseCookieOptions());
}

export function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    ...baseCookieOptions(),
    maxAge: undefined,
  });
}

const XP_PER_LEVEL = 500;

/* The only user shape the client ever receives. It deliberately exposes the
   paymentPIN *flag* and never the hash, and it carries enough progression
   state for the shell to render the level bar without a second request. */
export function publicUser(user) {
  const levelStartXp = (user.level - 1) * XP_PER_LEVEL;

  return {
    id: String(user._id),
    username: user.username,
    email: user.email,
    avatar: user.avatar ?? "",
    level: user.level,
    xp: user.xp,
    career: user.career,
    streak: user.streak ?? 0,
    bestStreak: user.bestStreak ?? 0,
    cycle: user.cycle ?? 0,
    hasPaymentPin: Boolean(user.paymentPinSet),
    pinLocked: Boolean(user.pinLockedUntil && user.pinLockedUntil.getTime() > Date.now()),
    levelStartXp,
    levelNextXp: user.level * XP_PER_LEVEL,
    levelProgress: Math.min(
      1,
      Math.max(0, (user.xp - levelStartXp) / XP_PER_LEVEL),
    ),
    createdAt: user.createdAt,
  };
}
