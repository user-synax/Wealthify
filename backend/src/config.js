import "dotenv/config";

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing required env var ${name} (see backend/.env.example)`);
  }
  return value;
}

/* Number of reverse-proxy hops in front of the app, or 0 when it is served
   directly. This is not cosmetic: express-rate-limit keys on `req.ip`, and with
   `trust proxy` unset behind a load balancer every request arrives with the
   balancer's address — so one shared bucket would rate-limit every user at
   once, while a too-high value lets a client spoof `X-Forwarded-For` and mint
   itself a fresh bucket per request. Set it to the real number of hops. */
const trustProxy = (() => {
  const raw = Number(process.env.TRUST_PROXY);
  return Number.isInteger(raw) && raw > 0 && raw <= 10 ? raw : 0;
})();

export const config = {
  port: Number(process.env.PORT ?? 4000),
  mongoUri: required("MONGODB_URI", "mongodb://127.0.0.1:27017/wealthify"),
  jwtSecret: required("JWT_SECRET", undefined),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",
  isProd: process.env.NODE_ENV === "production",
  trustProxy,
};

// Money is stored as integer paise everywhere (PRD anti-cheat).
// Starting cash for a new account: Rs 25,000.
export const STARTING_CASH_PAISE = 25_000 * 100;
export const AUTH_COOKIE_NAME = "wealthify_token";
export const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/* ----------------------------------------------------------------------------
   Simulated clock (PRD): 1 real day is 1 simulated month. "Cycle" is the
   integer count of simulated months that have elapsed since signup, so it is
   the unit every recurring money event is keyed on (salary, bills, streaks).

   Override SIM_MONTH_MS to compress the loop while developing. 10 minutes is
   a good value: a full payday-to-payday month becomes observable in one
   sitting. Leave it unset for the PRD's 1 day = 1 month.
   -------------------------------------------------------------------------- */
export const SIM_MONTH_MS = (() => {
  const raw = Number(process.env.SIM_MONTH_MS);
  if (!Number.isFinite(raw) || raw < 60_000) return 24 * 60 * 60 * 1000;
  return raw;
})();

// Largest single payment the simulator will accept (Rs 1 crore). Anything
// above this is almost certainly bad input rather than a real purchase.
export const MAX_PAYMENT_PAISE = 10_000_000 * 100;

// Wrong-PIN guard: this many misses locks payments for PIN_LOCK_MS.
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCK_MS = 10 * 60 * 1000;
