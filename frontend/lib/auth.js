"use client";

// Auth-specific calls. The transport, the error type and the money formatters
// live in lib/api.js so the whole app shares one definition of each.
import { apiRequest } from "./api";

export { formatPaise } from "./api";

export const signup = (payload) =>
  apiRequest("/api/auth/signup", { method: "POST", body: payload });

export const login = (payload) =>
  apiRequest("/api/auth/login", { method: "POST", body: payload });

export const logout = () => apiRequest("/api/auth/logout", { method: "POST" });

export const fetchMe = () => apiRequest("/api/auth/me");

export const updateProfile = (payload) =>
  apiRequest("/api/auth/profile", { method: "PATCH", body: payload });

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
