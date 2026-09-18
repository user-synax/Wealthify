import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { authRouter } from "./routes/auth.js";

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

// 404 for unknown API routes.
app.use("/api", (req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND" } });
});

// Central error handler (must be last).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR" } });
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
