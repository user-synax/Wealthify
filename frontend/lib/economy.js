"use client";

import { apiRequest, newIdempotencyKey } from "./api";

/* Every money-moving call takes an idempotency key the *caller* owns, so a
   retry inside the payment sheet reuses the key it already started with and
   the ledger replays instead of charging twice. `clientKey` is that caller
   key; when it is omitted a fresh one is minted for a single-shot call. */

const key = (clientKey) => clientKey ?? newIdempotencyKey();

/* --- Wallet --------------------------------------------------------------- */
export const fetchWallet = (signal) => apiRequest("/api/wallet", { signal });

export const transfer = ({ direction, amount, clientKey, signal }) =>
  apiRequest("/api/wallet/transfer", {
    method: "POST",
    body: { direction, amount, idempotencyKey: key(clientKey) },
    signal,
  });

/* --- Store --------------------------------------------------------------- */
export const fetchStore = (signal) => apiRequest("/api/store", { signal });

export const purchase = ({ sku, quantity = 1, paymentMethod, pin, clientKey, signal }) =>
  apiRequest("/api/store/purchase", {
    method: "POST",
    body: { sku, quantity, paymentMethod, pin, idempotencyKey: key(clientKey) },
    signal,
  });

/* --- Activity ------------------------------------------------------------ */
export function fetchTransactions({ limit = 20, cursor, type, direction, category, q, signal } = {}) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (cursor) params.set("cursor", cursor);
  if (type && type !== "all") params.set("type", type);
  if (direction && direction !== "all") params.set("direction", direction);
  if (category && category !== "all") params.set("category", category);
  if (q) params.set("q", q);
  return apiRequest(`/api/transactions?${params.toString()}`, { signal });
}

export const fetchReceipt = (id, signal) =>
  apiRequest(`/api/transactions/${id}`, { signal });

/* --- Income -------------------------------------------------------------- */
export const fetchIncome = (signal) => apiRequest("/api/income", { signal });

export const workGig = ({ id, clientKey, signal }) =>
  apiRequest(`/api/income/gigs/${id}/work`, {
    method: "POST",
    body: { idempotencyKey: key(clientKey) },
    signal,
  });

export const completeTask = ({ id, clientKey, signal }) =>
  apiRequest(`/api/income/tasks/${id}/complete`, {
    method: "POST",
    body: { idempotencyKey: key(clientKey) },
    signal,
  });

/* --- Expenses ------------------------------------------------------------ */
export const fetchExpenses = (signal) => apiRequest("/api/expenses", { signal });

export const payBill = ({ id, paymentMethod, pin, clientKey, signal }) =>
  apiRequest(`/api/expenses/bills/${id}/pay`, {
    method: "POST",
    body: { paymentMethod, pin, idempotencyKey: key(clientKey) },
    signal,
  });

export const setAutopay = ({ id, autopay, signal }) =>
  apiRequest(`/api/expenses/bills/${id}`, {
    method: "PATCH",
    body: { autopay },
    signal,
  });

/* --- Payments ------------------------------------------------------------ */
export const fetchPaymentMethods = (signal) =>
  apiRequest("/api/payments/methods", { signal });

export const fetchPaymentStatus = (signal) =>
  apiRequest("/api/payments/status", { signal });

export const createPaymentPin = ({ pin, currentPin, signal }) =>
  apiRequest("/api/payments/pin", {
    method: "POST",
    body: { pin, currentPin },
    signal,
  });
