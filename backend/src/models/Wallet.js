import mongoose from "mongoose";

/* All money fields are integer paise (PRD: never floats for money).

   Every mutation goes through services/ledger.js, which applies the change
   with a single conditional `$inc` so two concurrent payments can never both
   read the same balance and both succeed. The `min: 0` guards are a second
   line of defence: even a bug that skips the funds check cannot drive a
   balance negative through Mongoose validation. */
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

    // Last simulated cycle a salary was credited for. Starts at 0 so the first
    // payday lands when cycle 1 begins, rather than double-paying the signup
    // bonus on day zero.
    lastSalaryCycle: { type: Number, default: 0 },
    lastBillCycle: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Wallet =
  mongoose.models.Wallet ?? mongoose.model("Wallet", walletSchema);
