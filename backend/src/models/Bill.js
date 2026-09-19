import mongoose from "mongoose";

/* ----------------------------------------------------------------------------
   A recurring expense owned by one user.

   Due-ness is a pure function of (simulated cycle, lastPaidCycle) rather than a
   stored date, so a bill cannot be "missed" by a server that was asleep: the
   clock advances, and every unpaid cycle is visible the moment the user
   returns. `lastPaidCycle` starting at -1 is what makes the seeded month due
   immediately.

   Bills are never deleted, only settled, because they are the simulator's
   source of financial pressure and a deletable rent cheque is not a game.
   -------------------------------------------------------------------------- */
const billSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    key: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, required: true, default: "general" },
    icon: { type: String, default: "Receipt" },
    amount: { type: Number, required: true, min: 1 },
    note: { type: String, default: "" },

    // Cycle the bill first came due in.
    dueCycle: { type: Number, default: 0, min: 0 },
    // Cycle the bill was last settled for. -1 means never.
    lastPaidCycle: { type: Number, default: -1 },
    autopay: { type: Boolean, default: false },
    // Set when autopay could not collect, so the UI can explain why.
    lastAutopayFailureCycle: { type: Number, default: null },

    // Where this bill came from: the starter set, or a product that carries
    // upkeep with it.
    source: { type: String, enum: ["starter", "purchase"], default: "starter" },
    sourceSku: { type: String, default: "" },
  },
  { timestamps: true },
);

billSchema.index({ userId: 1, key: 1 }, { unique: true });

export const Bill = mongoose.models.Bill ?? mongoose.model("Bill", billSchema);
