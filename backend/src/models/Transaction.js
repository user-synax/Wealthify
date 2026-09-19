import mongoose from "mongoose";

/* ----------------------------------------------------------------------------
   Immutable money log (PRD section 9).

   Rows are never updated after completion and never deleted. The only writer
   that touches a row after insert is the ledger, and only to move it from
   `pending` to `completed` (or `failed`) — a correction to a settled
   transaction is a new compensating transaction, never an edit.

   `direction` is stored alongside `type` because the UI almost always wants
   "did money go in or out" and deriving that from a type list at every call
   site is how sign bugs get in.
   -------------------------------------------------------------------------- */
const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["reward", "income", "expense", "transfer", "investment", "career"],
    },
    direction: {
      type: String,
      required: true,
      enum: ["credit", "debit"],
      default: "debit",
    },
    // Integer paise. Zero is allowed but reserved for informational entries
    // such as a promotion, which move no money and say so explicitly.
    amount: { type: Number, required: true, min: 0, max: Number.MAX_SAFE_INTEGER },
    category: { type: String, required: true, default: "general" },
    description: { type: String, default: "" },
    balanceBefore: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true, min: 0 },

    status: {
      type: String,
      required: true,
      enum: ["pending", "completed", "failed"],
      default: "pending",
      index: true,
    },
    failureReason: { type: String, default: "" },

    paymentMethod: {
      type: String,
      enum: ["balance", "upi", "card", "autopay", "system"],
      default: "balance",
    },
    // Human-readable payment id printed on the receipt.
    reference: { type: String, required: true, index: true },
    // Which simulated month the entry belongs to.
    simCycle: { type: Number, default: 0 },

    /* Replay protection. A retried request presents the same key and gets the
       original row back instead of a second charge. The partial index means
       documents without a key (internal credits) never collide. */
    idempotencyKey: { type: String, default: undefined },

    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

transactionSchema.index(
  { userId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  },
);

// The activity feed is "newest first, for this user", so the index mirrors it.
transactionSchema.index({ userId: 1, createdAt: -1 });

export const Transaction =
  mongoose.models.Transaction ??
  mongoose.model("Transaction", transactionSchema);
