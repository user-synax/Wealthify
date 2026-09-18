"use client";

// Single place that talks to the Express API. Cookies carry the session
// (httpOnly), so every request uses credentials: "include" and the client
// never sees the token.

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message ?? "Something went wrong. Try again.");
    err.code = data?.error?.code;
    err.fields = data?.error?.fields;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const signup = (payload) =>
  request("/api/auth/signup", { method: "POST", body: JSON.stringify(payload) });

export const login = (payload) =>
  request("/api/auth/login", { method: "POST", body: JSON.stringify(payload) });

export const logout = () => request("/api/auth/logout", { method: "POST" });

export const fetchMe = () => request("/api/auth/me");

// Balances arrive as integer paise (PRD); only the UI formats them.
const inr = new Intl.NumberFormat("en-IN");
export const formatPaise = (paise) => `₹${inr.format(Math.round(paise / 100))}`;

// Where to send the user after login/signup. Honours the `?next=` hint set
// by the route guard, but only for same-origin app paths.
export function safeNextTarget(fallback = "/dashboard") {
  try {
    const next = new URLSearchParams(window.location.search).get("next");
    if (
      typeof next === "string" &&
      next.startsWith("/") &&
      !next.startsWith("//") &&
      !next.startsWith("/login") &&
      !next.startsWith("/signup")
    ) {
      return next;
    }
  } catch {
    // Non-browser context or malformed URL: fall through.
  }
  return fallback;
}
