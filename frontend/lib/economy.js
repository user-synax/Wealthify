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

/* The notifier's read, used on every signed-in page. It is a fraction of the
   income payload on purpose: a background tab checking whether a timer has
   finished should not be rebuilding the gig board every minute. */
export const fetchEngagementStatus = (signal) =>
  apiRequest("/api/income/engagements/status", { signal });

/* Starting a job moves no money, so it needs no key: the server's unique index
   on live runs is what makes a double tap safe, and it answers the second tap
   with the run the first one opened. */
export const startGig = ({ id, signal }) =>
  apiRequest(`/api/income/gigs/${id}/start`, { method: "POST", body: {}, signal });

/* A course is a payment, so it carries the same credential and the same
   idempotency key as anything else bought in the app. */
export const enrolCourse = ({ id, paymentMethod, pin, clientKey, signal }) =>
  apiRequest(`/api/income/courses/${id}/enroll`, {
    method: "POST",
    body: { paymentMethod, pin, idempotencyKey: key(clientKey) },
    signal,
  });

/* Transferring a finished job's escrow into the wallet. The label the user sees
   is "Transfer"; the money lands as a normal income entry with a receipt. */
export const transferEarnings = ({ id, clientKey, signal }) =>
  apiRequest(`/api/income/engagements/${id}/transfer`, {
    method: "POST",
    body: { idempotencyKey: key(clientKey) },
    signal,
  });

export const transferAllEarnings = ({ clientKey, signal }) =>
  apiRequest("/api/income/earnings/transfer", {
    method: "POST",
    body: { idempotencyKey: key(clientKey) },
    signal,
  });

/* Claiming a finished course. No money moves, so no key is needed. */
export const collectCourse = ({ id, signal }) =>
  apiRequest(`/api/income/engagements/${id}/collect`, { method: "POST", body: {}, signal });

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
