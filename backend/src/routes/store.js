import { Router } from "express";
import rateLimit from "express-rate-limit";
import { Bill } from "../models/Bill.js";
import { Inventory } from "../models/Inventory.js";
import { requireAuth } from "../middleware/auth.js";
import { MAX_PAYMENT_PAISE } from "../config.js";
import { badRequest, notFound } from "../utils/http-error.js";
import {
  PRODUCTS_BY_SKU,
  PRODUCT_CATEGORIES,
  RARITIES,
  publicCatalog,
  rewardBonusPct,
} from "../data/catalog.js";
import { postEntry } from "../services/ledger.js";
import { verifyPin } from "../services/payments.js";
import { awardXp, syncEconomy } from "../services/economy.js";
import { buildReceipt } from "../services/receipts.js";

export const storeRouter = Router();
storeRouter.use(requireAuth);

/* Purchases are the highest-value action in the app, so they get their own
   ceiling on top of the PIN: 30 attempts a minute is far above what a person
   can click and far below what a script needs to grind the balance down. */
const purchaseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Slow down a moment." } },
});

const RARITY_XP = { common: 10, rare: 25, epic: 60, legendary: 150 };
const MAX_QUANTITY = 5;

const isIdempotencyKey = (value) =>
  typeof value === "string" && /^[\w:-]{8,120}$/.test(value);

const PAYMENT_METHODS = new Set(["balance", "upi", "card"]);

async function ownedSkus(userId) {
  const rows = await Inventory.find({ userId }).select("sku quantity").lean();
  return new Map(rows.map((row) => [row.sku, row.quantity]));
}

/* GET /api/store — the shelf.
   Prices come from here, never from the client, and affordability is computed
   server-side so the UI cannot offer a purchase the ledger would decline. */
storeRouter.get("/", async (req, res, next) => {
  try {
    const { wallet, cycle, clock, notices } = await syncEconomy(req.user);
    const owned = await ownedSkus(req.user._id);
    const bonusPct = rewardBonusPct(owned.keys());

    const products = publicCatalog().map((product) => {
      const quantity = owned.get(product.sku) ?? 0;
      return {
        ...product,
        rarityLabel: RARITIES[product.rarity]?.label ?? "Common",
        owned: quantity > 0,
        quantity,
        affordable: wallet.cashBalance >= product.price,
        shortfall: Math.max(0, product.price - wallet.cashBalance),
      };
    });

    return res.json({
      categories: PRODUCT_CATEGORIES,
      products,
      wallet,
      clock,
      notices,
      bonusPct,
      career: req.user.career,
      level: req.user.level,
      xp: req.user.xp,
      cycle,
    });
  } catch (err) {
    return next(err);
  }
});

/* POST /api/store/purchase
   The full order pipeline (PRD section 9): verify user → verify product and
   price → verify PIN → verify balance → create transaction → debit → commit.
   The product is looked up by sku and the price is taken from the catalog, so
   the request body cannot influence what anything costs. */
storeRouter.post("/purchase", purchaseLimiter, async (req, res, next) => {
  try {
    const sku = req.body?.sku;
    const quantity = req.body?.quantity ?? 1;
    const paymentMethod = req.body?.paymentMethod ?? "balance";
    const pin = req.body?.pin;
    const idempotencyKey = req.body?.idempotencyKey;

    const product = typeof sku === "string" ? PRODUCTS_BY_SKU.get(sku) : undefined;
    if (!product) throw notFound("PRODUCT_NOT_FOUND", { message: "That item is not in the store." });

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw badRequest("INVALID_QUANTITY", {
        message: `You can buy between 1 and ${MAX_QUANTITY} of these at a time.`,
      });
    }
    if (!PAYMENT_METHODS.has(paymentMethod)) {
      throw badRequest("INVALID_PAYMENT_METHOD", { message: "Choose a payment method." });
    }
    if (!isIdempotencyKey(idempotencyKey)) {
      throw badRequest("IDEMPOTENCY_KEY_REQUIRED", {
        message: "A purchase must carry an idempotency key.",
      });
    }

    const total = product.price * quantity;
    if (total > MAX_PAYMENT_PAISE) {
      throw badRequest("AMOUNT_TOO_LARGE", { message: "That order is larger than the simulator allows." });
    }

    // PIN first, then money: a wrong PIN must not leak whether the balance was
    // sufficient, and it must not burn the idempotency key.
    await verifyPin(req.user, pin);

    const { cycle, clock } = await syncEconomy(req.user);

    const { transaction, wallet, replay } = await postEntry({
      user: req.user,
      type: "expense",
      direction: "debit",
      amount: total,
      category: product.category,
      description: quantity > 1 ? `${product.name} ×${quantity}` : product.name,
      paymentMethod,
      idempotencyKey: `purchase:${req.user._id}:${idempotencyKey}`,
      simCycle: cycle,
      metadata: {
        icon: product.icon,
        accent: RARITIES[product.rarity]?.accent ?? "steel",
        merchant: "Wealthify Store",
        sku: product.sku,
        quantity,
        unitPrice: product.price,
        rarity: product.rarity,
        items: [
          {
            label: `${product.name}${quantity > 1 ? ` × ${quantity}` : ""}`,
            amount: total,
            note: `₹${Math.round(product.price / 100).toLocaleString("en-IN")} each`,
          },
        ],
      },
    });

    // A replay already applied the inventory and upkeep side effects, so only
    // the first successful call is allowed to mutate state.
    let unlockedBill = null;
    let leveledUp = false;
    if (!replay) {
      await Inventory.findOneAndUpdate(
        { userId: req.user._id, sku: product.sku },
        {
          $inc: { quantity },
          $set: { lastAcquiredAt: new Date() },
          $setOnInsert: { firstAcquiredAt: new Date() },
        },
        { upsert: true },
      );

      /* Upkeep attached to the item. Ownership is what triggers it, not the
         quantity, so buying a second car does not double the service bill. */
      if (product.addsBill) {
        const existing = await Bill.findOne({ userId: req.user._id, key: product.addsBill.key });
        if (!existing) {
          await Bill.create({
            userId: req.user._id,
            key: product.addsBill.key,
            name: product.addsBill.name,
            category: product.addsBill.category,
            icon: product.addsBill.icon,
            amount: product.addsBill.amount,
            note: `Added by your ${product.name}. Due the cycle after purchase.`,
            // Starts next cycle: this month is already paid for at the till.
            dueCycle: cycle + 1,
            lastPaidCycle: cycle,
            autopay: false,
            source: "purchase",
            sourceSku: product.sku,
          });
          unlockedBill = {
            name: product.addsBill.name,
            amount: product.addsBill.amount,
            category: product.addsBill.category,
          };
        }
      }

      leveledUp = awardXp(req.user, RARITY_XP[product.rarity] ?? 10);
      await req.user.save();
    }

    return res.status(201).json({
      receipt: buildReceipt({
        transaction,
        wallet,
        user: req.user,
        cycle,
        extra: {
          merchant: "Wealthify Store",
          note:
            product.rarity === "legendary"
              ? "A landmark purchase. Check what it added to your monthly bills."
              : "Paid in full. No returns in a simulation.",
          bonusPct: rewardBonusPct((await ownedSkus(req.user._id)).keys()),
          unlockedBill,
          leveledUp,
          level: req.user.level,
          xp: req.user.xp,
          replay,
        },
      }),
      clock,
    });
  } catch (err) {
    return next(err);
  }
});
