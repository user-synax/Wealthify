import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { HttpError } from "./utils/http-error.js";
import { originGuard } from "./middleware/origin-guard.js";
import { authRouter } from "./routes/auth.js";
import { walletRouter } from "./routes/wallet.js";
import { storeRouter } from "./routes/store.js";
import { transactionsRouter } from "./routes/transactions.js";
import { incomeRouter } from "./routes/income.js";
import { expensesRouter } from "./routes/expenses.js";
import { paymentsRouter } from "./routes/payments.js";
import { socialRouter } from "./routes/social.js";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  // Fail fast: a short/default secret would make every session forgeable.
  throw new Error("Set JWT_SECRET to a random string of at least 32 characters (see backend/.env.example).");
}

const app = express();
app.disable("x-powered-by");

// Must happen before any rate limiter, which keys its buckets on `req.ip`.
if (config.trustProxy > 0) app.set("trust proxy", config.trustProxy);

app.use(helmet());
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
  }),
);
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

/* A baseline ceiling for the whole API, under the per-route limiters.

   The routes that move money are capped far tighter than this; what this
   covers is everything cheap enough that no one thought to limit it — catalog
   reads, the fee-free transaction feed, a loop that just probes for a 500. It
   is deliberately loose, because the app legitimately polls while work is in
   flight and one person must never be able to lock themselves out. */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Health checks are infrastructure, not user traffic.
  skip: (req) => req.path === "/health",
  message: { error: { code: "RATE_LIMITED", message: "Too many requests. Slow down." } },
});
app.use("/api", apiLimiter);

// Second CSRF layer for state-changing requests; see middleware/origin-guard.js.
app.use("/api", originGuard);

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/wallet", walletRouter);
app.use("/api/store", storeRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/income", incomeRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/social", socialRouter);

// 404 for unknown API routes.
app.use("/api", (req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND" } });
});

/* Central error handler (must be last).

   HttpError carries everything a client can act on — a stable `code`, an HTTP
   status, per-field messages and numeric details — so the whole API has one
   failure contract and no route has to format its own error response. */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json(err.toJSON());
  }
  // A duplicate key that got past a route's own check: the unique indexes are
  // the last line of defence for double-charging and duplicate accounts.
  if (err?.code === 11000) {
    return res.status(409).json({ error: { code: "ALREADY_EXISTS" } });
  }

  /* A malformed id in the URL (`/api/income/engagements/nope/transfer`) makes
     Mongoose throw a CastError from `findById`. Left alone that surfaces as a
     500, which is both wrong — the request was bad, the server was not — and a
     probe an attacker can use to distinguish "not an ObjectId" from "not
     found". Mapping it to the same 404 a missing row produces keeps every
     unknown id indistinguishable. */
  if (err?.name === "CastError") {
    return res.status(404).json({ error: { code: "NOT_FOUND" } });
  }

  // A schema violation that reached here is a bad request, not a server fault.
  if (err?.name === "ValidationError") {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", fields: Object.keys(err.errors ?? {}) },
    });
  }

  // A body larger than the parser's limit is the client's problem too.
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE" } });
  }
  console.error(err);
  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      // Surface the reason outside production. An opaque 500 in development
      // costs more debugging time than the hint is worth, and the stack stays
      // on the server either way.
      ...(config.isProd ? {} : { message: err?.message ?? String(err) }),
    },
  });
});

connectDb()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`wealthify backend listening on :${config.port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });
