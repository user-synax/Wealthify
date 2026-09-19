"use client";

import { useSyncExternalStore } from "react";

/* ----------------------------------------------------------------------------
   One shared "what time is it" ticker.

   Countdowns (gig cooldowns, the next payday, a PIN lockout) all need the
   current time, and reading the clock during render is exactly what the React
   compiler rules forbid: it makes a render non-deterministic and would differ
   between the server pass and hydration.

   So the time is treated as what it is — an external store. One module-level
   interval drives every subscriber, so ten countdowns on a page share a single
   timer instead of leaking ten. The server snapshot is `0`, which is how React
   is told "this value is not knowable until after hydration"; consumers render
   a placeholder while it is 0 rather than a wrong number.
   -------------------------------------------------------------------------- */

const TICK_MS = 1000;

let now = 0;
let timer = null;
const listeners = new Set();

function start() {
  if (timer) return;
  // Seed immediately so the first subscriber does not wait a full second.
  now = Date.now();
  timer = setInterval(() => {
    now = Date.now();
    for (const listener of listeners) listener();
  }, TICK_MS);
}

export function subscribe(listener) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => now;
const getServerSnapshot = () => 0;

/**
 * Current epoch milliseconds, refreshed once a second. Returns `0` on the
 * server and on the very first client render, so callers must handle "not
 * known yet" — {@link msUntil} and {@link secondsUntil} already do.
 */
export function useNow() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Milliseconds until an ISO timestamp, or null while the clock is unknown. */
export function msUntil(iso, now) {
  if (!now || !iso) return null;
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return null;
  return Math.max(0, target - now);
}
