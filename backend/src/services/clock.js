import { SIM_MONTH_MS } from "../config.js";

/* ----------------------------------------------------------------------------
   The simulated clock.

   One real day is one simulated month (PRD section 4), so the entire economy
   is keyed on an integer "cycle" rather than on calendar dates. Cycle 0 is the
   month the account was created in; a salary lands and the bills roll over
   when the cycle increments.

   Nothing here is stored as a wall-clock date the bills depend on. Due-ness is
   computed from the cycle, which means a closed laptop cannot cause a bill to
   be silently skipped — it simply accumulates, and arrears settle in one go.
   -------------------------------------------------------------------------- */

/* Time away should not be a money printer. A returning user is back-paid for
   at most three cycles of salary; beyond that the missed paycheques are gone,
   in the same way that real income stops when you stop showing up. The overdue
   side is bounded to match, so neither number can run away. */
export const MAX_CATCHUP_CYCLES = 3;

function startMs(user) {
  const started = user?.simStartedAt ?? user?.createdAt;
  const value = started ? new Date(started).getTime() : Date.now();
  return Number.isFinite(value) ? value : Date.now();
}

export function currentCycle(user, now = Date.now()) {
  return Math.max(0, Math.floor((now - startMs(user)) / SIM_MONTH_MS));
}

export function cycleStart(user, cycle) {
  return new Date(startMs(user) + cycle * SIM_MONTH_MS);
}

export function cycleLabel(user, cycle) {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(cycleStart(user, cycle));
}

export function shortCycleLabel(user, cycle) {
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(cycleStart(user, cycle));
}

/** Everything the UI needs to render the clock chip and its countdown. */
export function clockJson(user, { cycle, now = Date.now() } = {}) {
  const value = cycle ?? currentCycle(user, now);
  const startedAt = cycleStart(user, value);
  const nextCycleAt = cycleStart(user, value + 1);
  const span = nextCycleAt.getTime() - startedAt.getTime();
  const progress = span > 0 ? Math.min(1, Math.max(0, (now - startedAt.getTime()) / span)) : 0;

  return {
    cycle: value,
    label: cycleLabel(user, value),
    startedAt: cycleStart(user, 0).toISOString(),
    cycleStartedAt: startedAt.toISOString(),
    nextCycleAt: nextCycleAt.toISOString(),
    monthMs: SIM_MONTH_MS,
    progress,
  };
}

/** Real-day key (not a simulated one) used for the task cap and the streak. */
export function realDayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function daysBetweenKeys(a, b) {
  if (!a || !b) return Infinity;
  const first = Date.parse(`${a}T00:00:00Z`);
  const second = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return Infinity;
  return Math.round((second - first) / 86_400_000);
}
