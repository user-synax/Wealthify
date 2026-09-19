/* Response shaping. Nothing here reads a request, so these are pure views of a
   document and can be reused by the routes, the receipt endpoint and the
   economy sync without any risk of diverging shapes between them. */

export function walletJson(wallet) {
  if (!wallet) return null;
  return {
    cashBalance: wallet.cashBalance,
    savingsBalance: wallet.savingsBalance,
    totalEarned: wallet.totalEarned,
    totalSpent: wallet.totalSpent,
    totalInvested: wallet.totalInvested,
    netWorth: wallet.cashBalance + wallet.savingsBalance + wallet.totalInvested,
    lastSalaryCycle: wallet.lastSalaryCycle,
  };
}

function titleCase(value) {
  return String(value ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** One row of the activity feed, or one receipt. */
export function transactionJson(txn, { receipt = false } = {}) {
  if (!txn) return null;
  const json = {
    id: String(txn._id),
    type: txn.type,
    direction: txn.direction,
    amount: txn.amount,
    category: txn.category,
    title: txn.description || titleCase(txn.category),
    status: txn.status,
    reference: txn.reference,
    paymentMethod: txn.paymentMethod,
    balanceBefore: txn.balanceBefore,
    balanceAfter: txn.balanceAfter,
    simCycle: txn.simCycle,
    createdAt: txn.createdAt,
    metadata: txn.metadata ?? {},
  };

  if (receipt) {
    json.failureReason = txn.failureReason || "";
    json.items = Array.isArray(txn.metadata?.items) ? txn.metadata.items : [];
    json.merchant = txn.metadata?.merchant ?? null;
    json.note = txn.metadata?.note ?? "";
  } else {
    // The feed only needs the display hints; the full metadata is a receipt
    // concern and would bloat every list response.
    json.icon = txn.metadata?.icon ?? null;
    json.accent = txn.metadata?.accent ?? null;
    json.note = txn.metadata?.note ?? "";
    delete json.metadata;
  }

  return json;
}
