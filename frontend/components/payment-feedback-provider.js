"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

/* ----------------------------------------------------------------------------
   Payment feedback: sound and haptics.

   Both are synthesised rather than loaded from asset files. A payment app that
   ships five mp3s has to wait for them on a cold load, and the one moment that
   must never be silent is the balance changing. Web Audio generates the tones
   from the table below, the haptics ride `navigator.vibrate`, and both are
   behind a persisted preference because a phone that beeps in a meeting is a
   phone with the feature turned off forever.

   Preferences live in a module-level store read through useSyncExternalStore
   rather than in a useState + useEffect pair. Two reasons: localStorage is
   genuinely an external store, and hydrating it from an effect would write
   state synchronously during that effect. The server snapshot is the frozen
   default, so the server and the first client render always agree and hydration
   never mismatches; the real values arrive the moment the first subscriber
   mounts.

   The AudioContext is created lazily inside the gesture that needs it. Browsers
   refuse to start audio outside a user gesture, and every sound here follows a
   tap, so this never trips the autoplay policy.
   -------------------------------------------------------------------------- */

const STORAGE_KEY = "wealthify.paymentFeedback";

/* Interval ratios rather than notes, so the whole palette transposes by
   changing one base frequency. */
const CUES = {
  // Typing a PIN digit: a dry, tiny click.
  key: { freq: 2100, ms: 26, gain: 0.05, type: "square" },
  // The charge is in flight: a low, neutral hum.
  processing: { freq: 320, ms: 220, gain: 0.05, type: "sine" },
  // Money in: a rising three-note arpeggio.
  credit: { arpeggio: [523.25, 659.25, 783.99], ms: 130, gain: 0.075, type: "sine" },
  // Money out: a firm descending pair. Confirmed, not celebratory.
  debit: { arpeggio: [392, 293.66], ms: 120, gain: 0.07, type: "triangle" },
  // Payment landed: the credit arpeggio, one step higher.
  success: { arpeggio: [659.25, 830.61, 987.77], ms: 140, gain: 0.08, type: "sine" },
  // Declined / wrong PIN: a flat buzz.
  error: { arpeggio: [196, 174.61], ms: 170, gain: 0.07, type: "sawtooth" },
};

const HAPTICS = {
  key: 8,
  processing: 12,
  credit: [18, 40, 26],
  debit: [26, 40, 14],
  success: [16, 34, 16, 34, 30],
  error: [50, 60, 50],
};

const DEFAULTS = Object.freeze({
  sound: true,
  haptics: true,
  soundSupported: false,
  hapticsSupported: false,
});

let audioContext = null;

function context() {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? window.webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) audioContext = new Ctor();
  // Safari suspends a context created before the first gesture.
  if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
  return audioContext;
}

function tone(ctx, { freq, ms, gain, type, delay = 0 }) {
  const start = ctx.currentTime + delay;
  const duration = ms / 1000;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);

  // A short exponential tail rather than a hard stop: a square-edged gate on a
  // sine is heard as a click at the end of every note.
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(amp).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function playCue(name) {
  const cue = CUES[name];
  if (!cue) return;
  const ctx = context();
  if (!ctx) return;

  if (cue.arpeggio) {
    cue.arpeggio.forEach((freq, index) => {
      tone(ctx, {
        freq,
        ms: cue.ms,
        gain: cue.gain,
        type: cue.type,
        delay: index * (cue.ms / 1000) * 0.75,
      });
    });
    return;
  }
  tone(ctx, cue);
}

function buzz(name) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  const pattern = HAPTICS[name];
  if (!pattern) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers expose vibrate but refuse it in an iframe or without a
    // user gesture. A refused vibration is not worth surfacing.
  }
}

/* --- External store -------------------------------------------------------- */

let snapshot = DEFAULTS;
let hydrated = false;
const listeners = new Set();

function emit() {
  for (const listener of listeners) listener();
}

function detectSupport() {
  return {
    sound: Boolean(window.AudioContext ?? window.webkitAudioContext),
    haptics: typeof navigator.vibrate === "function",
  };
}

function readStored() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      sound: typeof parsed.sound === "boolean" ? parsed.sound : true,
      haptics: typeof parsed.haptics === "boolean" ? parsed.haptics : true,
    };
  } catch {
    return null;
  }
}

function subscribe(listener) {
  listeners.add(listener);

  // First subscriber does the one-time read. Doing it here rather than in an
  // effect keeps the write out of React's render/commit path.
  if (!hydrated) {
    hydrated = true;
    const stored = readStored();
    snapshot = { ...DEFAULTS, ...(stored ?? {}), ...detectSupport() };
    emit();
  }

  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => DEFAULTS;

function writePrefs(patch) {
  snapshot = { ...snapshot, ...patch };
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ sound: snapshot.sound, haptics: snapshot.haptics }),
    );
  } catch {
    // Private mode with storage disabled: the preference still applies for this
    // session, it just will not be remembered.
  }
  emit();
}

const FeedbackContext = createContext({
  sound: true,
  haptics: true,
  supported: { sound: false, haptics: false },
  setSound: () => {},
  setHaptics: () => {},
  play: () => {},
});

export function PaymentFeedbackProvider({ children }) {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setSound = useCallback((value) => writePrefs({ sound: Boolean(value) }), []);
  const setHaptics = useCallback((value) => writePrefs({ haptics: Boolean(value) }), []);

  /* One call site for every cue, so a payment can never be heard but not felt
     or vice versa — the two toggles are read together, once. */
  const play = useCallback(
    (name) => {
      const current = snapshot;
      if (current.sound) playCue(name);
      if (current.haptics) buzz(name);
    },
    [],
  );

  const value = useMemo(
    () => ({
      sound: prefs.sound,
      haptics: prefs.haptics,
      supported: { sound: prefs.soundSupported, haptics: prefs.hapticsSupported },
      setSound,
      setHaptics,
      play,
    }),
    [prefs, setSound, setHaptics, play],
  );

  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>;
}

export const usePaymentFeedback = () => useContext(FeedbackContext);
