import jwt from "jsonwebtoken";
import {
  AUTH_COOKIE_MAX_AGE_MS,
  AUTH_COOKIE_NAME,
  config,
} from "../config.js";

/* ----------------------------------------------------------------------------
   Session tokens.

   Two verifications are pinned rather than defaulted, because both defaults are
   footguns:

     - `algorithms: ["HS256"]` — without it, `jwt.verify` will happily accept
       whatever the token's own header asks for, which is the shape of the
       classic "alg: none" and RS256→HS256 confusion attacks. The secret is
       symmetric, so exactly one algorithm is ever legitimate.
     - `issuer` — a token signed with the same secret for a *different* service
       must not be accepted here. Cheap to add, and it is the difference between
       "our secret" and "our session".

   Expiry comes from config (7 days by default). The cookie is httpOnly so no
  script can read it. SameSite=None is required because the frontend and API
  use different sites in production, and Secure ensures it never crosses
  plaintext. The API's origin guard protects state-changing requests.
   -------------------------------------------------------------------------- */

const ISSUER = "wealthify";
const ALGORITHM = "HS256";

export function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
    algorithm: ALGORITHM,
    issuer: ISSUER,
  });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret, {
    algorithms: [ALGORITHM],
    issuer: ISSUER,
  });
}

function baseCookieOptions() {
  const crossSite = config.isProd || config.frontendUrl.startsWith("https://");

  return {
    httpOnly: true,
    sameSite: crossSite ? "none" : "lax",
    secure: crossSite,
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
    bio: user.bio ?? "",
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
