import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { HttpError } from "./utils/http-error.js";
import { authRouter } from "./routes/auth.js";
import { walletRouter } from "./routes/wallet.js";
import { storeRouter } from "./routes/store.js";
import { transactionsRouter } from "./routes/transactions.js";
import { incomeRouter } from "./routes/income.js";
import { expensesRouter } from "./routes/expenses.js";
import { paymentsRouter } from "./routes/payments.js";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  // Fail fast: a short/default secret would make every session forgeable.
  throw new Error("Set JWT_SECRET to a random string of at least 32 characters (see backend/.env.example).");
}

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
  }),
);
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/wallet", walletRouter);
app.use("/api/store", storeRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/income", incomeRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/payments", paymentsRouter);

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
