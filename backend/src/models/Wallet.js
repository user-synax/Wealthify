import mongoose from "mongoose";

// All money fields are integer paise (PRD: never floats for money).
const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    cashBalance: { type: Number, required: true, min: 0, default: 0 },
    savingsBalance: { type: Number, required: true, min: 0, default: 0 },
    totalEarned: { type: Number, required: true, min: 0, default: 0 },
    totalSpent: { type: Number, required: true, min: 0, default: 0 },
    totalInvested: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true },
);

export const Wallet =
  mongoose.models.Wallet ?? mongoose.model("Wallet", walletSchema);
