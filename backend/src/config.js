import "dotenv/config";

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing required env var ${name} (see backend/.env.example)`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  mongoUri: required("MONGODB_URI", "mongodb://127.0.0.1:27017/wealthify"),
  jwtSecret: required("JWT_SECRET", undefined),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",
  isProd: process.env.NODE_ENV === "production",
};

// Money is stored as integer paise everywhere (PRD anti-cheat).
// Starting cash for a new account: Rs 25,000.
export const STARTING_CASH_PAISE = 25_000 * 100;
export const AUTH_COOKIE_NAME = "wealthify_token";
export const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
