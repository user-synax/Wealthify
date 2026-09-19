import { Router } from "express";
import mongoose from "mongoose";
import { Transaction } from "../models/Transaction.js";
import { requireAuth } from "../middleware/auth.js";
import { badRequest, notFound } from "../utils/http-error.js";
import { transactionJson } from "../utils/serialize.js";
import { buildReceipt } from "../services/receipts.js";

export const transactionsRouter = Router();
transactionsRouter.use(requireAuth);

const MAX_PAGE = 50;
const DEFAULT_PAGE = 20;

const TYPES = new Set(["reward", "income", "expense", "transfer", "investment", "career"]);
const DIRECTIONS = new Set(["credit", "debit"]);

/* Cursor paging on (createdAt, _id) rather than skip/limit. The feed is
   append-forever, and a user who pays a bill between two page loads would
   otherwise see that row twice — or miss one — because every later offset
   shifted by one. A cursor is stable across inserts. */
function encodeCursor(doc) {
  return Buffer.from(`${new Date(doc.createdAt).toISOString()}|${doc._id}`, "utf8").toString("base64url");
}

function decodeCursor(raw) {
  const text = Buffer.from(String(raw), "base64url").toString("utf8");
  const splitAt = text.lastIndexOf("|");
  if (splitAt === -1) return null;
  const createdAt = new Date(text.slice(0, splitAt));
  const id = text.slice(splitAt + 1);
  if (Number.isNaN(createdAt.getTime()) || !mongoose.isValidObjectId(id)) return null;
  return { createdAt, id };
}

/* GET /api/transactions — the activity feed.
   Only settled and failed rows are returned; a `pending` row is a payment
   mid-flight and showing it would let the user "see" money that has not
   finished moving. */
transactionsRouter.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(MAX_PAGE, Math.max(1, Number(req.query.limit) || DEFAULT_PAGE));
    const type = req.query.type;
    const direction = req.query.direction;
    const category = req.query.category;
    const search = typeof req.query.q === "string" ? req.query.q.trim() : "";

    /* Failed attempts are logged for audit, but they are not part of the
       user's financial story. `includeFailed=1` surfaces them for the rare
       case (debugging a declined payment) where they matter. */
    const filter = { userId: req.user._id, status: { $in: ["completed", "failed"] } };
    if (req.query.includeFailed !== "1") filter.status = "completed";

    if (typeof type === "string" && TYPES.has(type)) filter.type = type;
    if (typeof direction === "string" && DIRECTIONS.has(direction)) filter.direction = direction;
    if (typeof category === "string" && category && category !== "all") filter.category = category;
    if (search) {
      // Escaped so a user typing "(" in the search box cannot build a bad regex.
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.description = { $regex: safe, $options: "i" };
    }

    if (typeof req.query.cursor === "string" && req.query.cursor) {
      const cursor = decodeCursor(req.query.cursor);
      if (!cursor) throw badRequest("BAD_CURSOR", { message: "That page link is not valid." });
      filter.$or = [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: new mongoose.Types.ObjectId(cursor.id) } },
      ];
    }

    // One extra row tells us whether a further page exists without a count.
    const rows = await Transaction.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const items = page.map((row) => transactionJson(row));
    const totals = items.reduce(
      (acc, item) => {
        if (item.direction === "credit") acc.credit += item.amount;
        else acc.debit += item.amount;
        return acc;
      },
      { credit: 0, debit: 0 },
    );

    return res.json({
      items,
      totals,
      nextCursor: hasMore && page.length > 0 ? encodeCursor(page[page.length - 1]) : null,
    });
  } catch (err) {
    return next(err);
  }
});

/* GET /api/transactions/:id — the receipt view.
   The history list deliberately drops most metadata; this returns the whole
   document so the receipt can be re-opened from a row days later without the
   list response having carried its line items. */
transactionsRouter.get("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw notFound("TRANSACTION_NOT_FOUND", { message: "That receipt does not exist." });
    }

    const transaction = await Transaction.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!transaction) {
      throw notFound("TRANSACTION_NOT_FOUND", { message: "That receipt does not exist." });
    }

    // No wallet: the row's own balanceAfter is the balance at the time of
    // payment, which is what belongs on a receipt.
    return res.json({ receipt: buildReceipt({ transaction, user: req.user }) });
  } catch (err) {
    return next(err);
  }
});
