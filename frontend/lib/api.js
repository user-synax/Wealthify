"use client";

/* Single place that talks to the Express API. Cookies carry the session
   (httpOnly), so every request uses credentials: "include" and the client
   never sees the token. */

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * One request shape for the whole app. Every failure becomes an ApiError
 * carrying the server's stable `code` — routes branch on that, never on a
 * message string, so copy can change without breaking logic.
 */
export class ApiError extends Error {
  constructor({ code, message, fields, details, status }) {
    super(message ?? "Something went wrong. Try again.");
    this.name = "ApiError";
    this.code = code ?? "UNKNOWN";
    this.fields = fields;
    this.details = details;
    this.status = status;
  }
}

export async function apiRequest(path, { method = "GET", body, signal } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError({
      code: data?.error?.code,
      message: data?.error?.message,
      fields: data?.error?.fields,
      details: data?.error?.details,
      status: res.status,
    });
  }

  return data;
}

/* ----------------------------------------------------------------------------
   Money.

   Balances cross the wire as integer paise (PRD anti-cheat); everything the
   user reads is formatted here and nowhere else, so a rupee figure can never
   be assembled from a string concatenation somewhere else in the tree.
   -------------------------------------------------------------------------- */

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inrPaise = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatPaise = (paise) => `₹${inr.format(Math.round((paise ?? 0) / 100))}`;

/** Two decimals, for a receipt line where the paise actually matter. */
export const formatPaiseExact = (paise) =>
  `₹${inrPaise.format((paise ?? 0) / 100)}`;

/** Signed, for a ledger row: "+₹450" / "-₹1,850". */
export const formatSignedPaise = (paise, direction) =>
  `${direction === "credit" ? "+" : "-"}${formatPaise(Math.abs(paise ?? 0))}`;

/** Rupees typed by a human → integer paise for the API. */
export function rupeesToPaise(rupees) {
  const value = Number(String(rupees).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export const paiseToRupees = (paise) => Math.round((paise ?? 0) / 100);

/* Durations for cooldowns and the simulated clock. */
export function formatDuration(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) return restMinutes ? `${hours}h ${restMinutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}

export function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Relative time for a ledger row, which is read as "when did this happen". */
export function formatRelative(value) {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return formatDate(value);
}

/**
 * A fresh idempotency key. Cooked up on the client and reused across retries of
 * the same logical payment so a flaky network can never charge twice.
 */
export function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
