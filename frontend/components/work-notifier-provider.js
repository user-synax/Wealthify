"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useAuth } from "./auth-provider";
import { useToast } from "./toast-provider";
import { usePaymentFeedback } from "./payment-feedback-provider";
import { fetchEngagementStatus } from "../lib/economy";
import { formatPaise } from "../lib/api";

/* ----------------------------------------------------------------------------
   Work notifications.

   Freelance work finishes while you are somewhere else — reading the store,
   paying a bill, or in another tab entirely. Without this the Transfer button
   appears silently and the escrow just sits there, which turns the best part of
   the loop into something you have to remember to go and check.

   Three deliberate choices:

   1. **A timer, not a poll.** The status endpoint reports the exact time the
      next job is due, so one request is enough to schedule the next check —
      no ticking every few seconds for twenty minutes. A slower safety poll
      runs underneath while anything is in flight, because a timer that fires
      late (or not at all, in a background tab) must not be the only mechanism.

   2. **Only transitions are announced.** The first observation primes the
      count instead of firing, otherwise reopening the app after a night away
      greets you with a notification for work the page is already showing you.

   3. **The room decides the channel.** Hidden tab and permission granted, it is
      a system notification, because that is the only thing that reaches you.
      Looking at the app, it is a toast and a chime, because a notification
      covering the page you are reading is worse than useless.

   Permission is never requested on load. It is asked for from a real click on
   the toggle, which is both what browsers require and what keeps the app from
   being the thing that demands notifications before you have done anything.
   -------------------------------------------------------------------------- */

const STORAGE_KEY = "wealthify.workNotifications";

/* Timers are throttled hard in background tabs — a minute or more, sometimes
   worse. This is the floor under that: often enough that a missed timer is
   recovered quickly, rarely enough that the API barely notices. */
const SAFETY_POLL_MS = 60_000;

const DEFAULTS = Object.freeze({
  enabled: false,
  permission: "unsupported",
});

// Stable identities, so a signed-out provider does not hand consumers a new
// array or object on every render and force them all to re-render.
const EMPTY_ITEMS = Object.freeze([]);
const IDLE_SLOTS = Object.freeze({ used: 0, max: 3 });

let snapshot = DEFAULTS;
let hydrated = false;
const listeners = new Set();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener) {
  listeners.add(listener);

  if (!hydrated) {
    hydrated = true;
    const supported = typeof window !== "undefined" && "Notification" in window;
    let enabled = false;
    try {
      enabled = window.localStorage.getItem(STORAGE_KEY) === "on";
    } catch {
      // Storage disabled: the preference is simply not remembered.
    }
    snapshot = {
      enabled: enabled && supported && window.Notification.permission === "granted",
      permission: supported ? window.Notification.permission : "unsupported",
    };
    emit();
  }

  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => DEFAULTS;

function writeEnabled(enabled) {
  snapshot = { ...snapshot, enabled };
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // See above.
  }
  emit();
}

const NotifierContext = createContext({
  readyCount: 0,
  readyItems: [],
  pendingAmount: 0,
  running: 0,
  slots: { used: 0, max: 3 },
  notifications: DEFAULTS,
  setNotificationsEnabled: async () => {},
  refresh: () => {},
});

export function WorkNotifierProvider({ children }) {
  const { status } = useAuth();
  const toast = useToast();
  const feedback = usePaymentFeedback();
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const [state, setState] = useState({
    readyItems: [],
    readyCount: 0,
    pendingAmount: 0,
    running: 0,
    slots: { used: 0, max: 3 },
  });

  const timer = useRef(null);
  const poll = useRef(null);
  /* Null until the first observation, which primes rather than announces. Ids
     rather than a count, so a job that finishes while another is transferred
     is still recognised as new instead of cancelling out in the total. */
  const seenIds = useRef(null);

  const announce = useCallback(
    (items, pendingAmount) => {
      if (!items.length) return;

      const gigs = items.filter((item) => item.kind === "gig");
      const courses = items.filter((item) => item.kind === "course");

      // One finishing job is named; several are counted, because a heading that
      // reads "3 jobs" is more useful than three names stacked in a toast.
      const title =
        items.length === 1
          ? `${items[0].title} finished`
          : gigs.length && courses.length
            ? `${items.length} things finished`
            : gigs.length
              ? `${gigs.length} jobs finished`
              : `${courses.length} courses finished`;

      const body =
        items.length === 1
          ? gigs.length
            ? `${formatPaise(items[0].reward)} is in escrow. Transfer it into your wallet.`
            : "Collect the skill level to unlock its work."
          : gigs.length && courses.length
            ? `${formatPaise(pendingAmount)} is in escrow plus ${courses.length} course${
                courses.length === 1 ? "" : "s"
              } to collect.`
            : gigs.length
              ? `${formatPaise(pendingAmount)} is in escrow and ready to transfer.`
              : "Collect each one to unlock its work.";

      feedback.play("ready");

      // A system notification is only the right channel when nothing else can
      // reach the user. Otherwise the app is already talking to them.
      if (document.hidden && snapshot.permission === "granted") {
        try {
          new Notification(title, {
            body,
            icon: "/wealthify-mark.png",
            // One tag, so six jobs finishing together replace each other
            // rather than stacking six rows in the notification centre.
            tag: "wealthify-work",
          });
          return;
        } catch {
          // Some browsers throw for tag/icon combinations they dislike; the
          // in-app toast below is still the fallback.
        }
      }

      toast.push({ tone: "milestone", title, body, duration: 9000 });
    },
    [feedback, toast],
  );

  const check = useCallback(async () => {
    try {
      const data = await fetchEngagementStatus();
      setState({
        readyItems: data.readyItems ?? [],
        readyCount: data.ready,
        pendingAmount: data.pendingAmount,
        running: data.running,
        slots: data.slots,
      });
      return data;
    } catch {
      // A failed check is not worth a toast; the next one will do.
      return null;
    }
  }, []);

  /* The scheduled check: one request, then a timer for the exact moment the
     soonest job is due. */
  const schedule = useCallback(
    (soonestFinishAt) => {
      clearTimeout(timer.current);
      if (!soonestFinishAt) return;
      const delay = Math.max(400, new Date(soonestFinishAt).getTime() - Date.now() + 800);
      timer.current = setTimeout(() => {
        check().catch(() => {});
      }, delay);
    },
    [check],
  );

  // Kick off on sign-in and clear everything on sign-out.
  useEffect(() => {
    if (status !== "authenticated") {
      // Signing out only has to *stop* things. The zeros are derived below
      // rather than written here, so this effect never sets state in its body
      // and a sign-out cannot cascade a render through the whole provider tree.
      clearTimeout(timer.current);
      clearInterval(poll.current);
      seenIds.current = null;
      return;
    }

    let cancelled = false;
    fetchEngagementStatus()
      .then((data) => {
        if (cancelled) return;
        // Prime here rather than in the announce effect, so the very first
        // observation can never be mistaken for a transition.
        seenIds.current = new Set((data.readyItems ?? []).map((item) => item.id));
        setState({
          readyItems: data.readyItems ?? [],
          readyCount: data.ready,
          pendingAmount: data.pendingAmount,
          running: data.running,
          slots: data.slots,
        });
        schedule(data.soonestFinishAt);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      clearTimeout(timer.current);
    };
  }, [status, schedule]);

  /* The safety net. Only runs while something is actually in flight, so an idle
     session makes no requests at all. */
  useEffect(() => {
    clearInterval(poll.current);
    if (status !== "authenticated" || state.running === 0) return;

    poll.current = setInterval(() => {
      check().catch(() => {});
    }, SAFETY_POLL_MS);

    return () => clearInterval(poll.current);
  }, [status, state.running, check]);

  /* Announce on the transition, not on the state. A null `seenIds` means the
     priming observation has not happened yet, and nothing is announced. */
  useEffect(() => {
    if (status !== "authenticated") return;
    if (seenIds.current === null) return;

    const fresh = state.readyItems.filter((item) => !seenIds.current.has(item.id));
    for (const item of state.readyItems) seenIds.current.add(item.id);
    if (fresh.length) announce(fresh, state.pendingAmount);
  }, [state.readyItems, state.pendingAmount, status, announce]);

  /* Tab title badge. Stripping any existing prefix first keeps it idempotent
     when Next re-applies metadata on navigation. */
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = state.readyCount > 0 ? `(${state.readyCount}) ${base}` : base;
  }, [state.readyCount]);

  /* Resuming a hidden tab is a chance to catch up on everything that happened
     while the page was asleep. */
  useEffect(() => {
    if (status !== "authenticated") return;
    const onVisible = () => {
      if (!document.hidden) check().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [status, check]);

  const setNotificationsEnabled = useCallback(async (next) => {
    if (!next) {
      writeEnabled(false);
      return "off";
    }
    if (typeof window === "undefined" || !("Notification" in window)) {
      snapshot = { ...snapshot, permission: "unsupported" };
      emit();
      return "unsupported";
    }
    // Permission must be requested from this click, not from an effect.
    const permission =
      window.Notification.permission === "granted"
        ? "granted"
        : await window.Notification.requestPermission();
    snapshot = { ...snapshot, permission };
    if (permission === "granted") writeEnabled(true);
    else emit();
    return permission;
  }, []);

  /* Signed out reports nothing, whatever the last session left in state. This
     is a derivation rather than a reset: one source of truth (the fetch), and
     one rule about who gets to see it. */
  const live = status === "authenticated";

  const value = useMemo(
    () => ({
      readyCount: live ? state.readyCount : 0,
      readyItems: live ? state.readyItems : EMPTY_ITEMS,
      pendingAmount: live ? state.pendingAmount : 0,
      running: live ? state.running : 0,
      slots: live ? state.slots : IDLE_SLOTS,
      notifications: prefs,
      setNotificationsEnabled,
      refresh: check,
    }),
    [state, live, prefs, setNotificationsEnabled, check],
  );

  return <NotifierContext.Provider value={value}>{children}</NotifierContext.Provider>;
}

export const useWorkNotifier = () => useContext(NotifierContext);
