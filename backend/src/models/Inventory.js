import mongoose from "mongoose";

/* What a user owns. Purchases are additive rather than a single "bought" flag:
   buying the same item twice is allowed (a second grocery run is a real thing)
   and the row accumulates quantity, while the effects bonus is read from the
   set of distinct skus so a duplicate purchase cannot double its bonus. */
const inventorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sku: { type: String, required: true },
    quantity: { type: Number, default: 1, min: 1 },
    firstAcquiredAt: { type: Date, default: () => new Date() },
    lastAcquiredAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

inventorySchema.index({ userId: 1, sku: 1 }, { unique: true });

export const Inventory =
  mongoose.models.Inventory ?? mongoose.model("Inventory", inventorySchema);
