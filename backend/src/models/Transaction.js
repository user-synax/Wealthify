import mongoose from "mongoose";

// Immutable money log (PRD). Corrections are new compensating transactions;
// updates/deletes are never performed by the API.
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
      enum: ["reward", "income", "expense", "transfer", "investment"],
    },
    amount: { type: Number, required: true, min: 1 },
    category: { type: String, required: true, default: "general" },
    description: { type: String, default: "" },
    balanceBefore: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true, min: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export const Transaction =
  mongoose.models.Transaction ??
  mongoose.model("Transaction", transactionSchema);
