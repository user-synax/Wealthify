"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

/* ----------------------------------------------------------------------------
   How a payment sounds.

   Everything is synthesised through the Web Audio API rather than loaded from
   files. Two reasons, and the second is the one that mattered:

     1. Asset files have to arrive. The one moment in this app that must never
        be silent is the balance changing, and a cold load on a slow connection
        is exactly when an mp3 is still in flight.

     2. A real payment has a *shape*. A terminal clicks, a network thinks, a
        bank approves, and the receipt lands. That shape is a sequence of short
        cues, and generating them means the timing between them is ours.

   The voices are built to sound physical rather than beepy:

     - every tone is a pair of oscillators, one detuned a few cents, so they
       beat against each other the way a struck object does;
     - bright sounds are a bell-ish stack of harmonics with a fast attack and a
       long exponential tail, not a bare sine;
     - clicks are filtered white noise, because that is what a click is;
     - everything runs through one compressor, so a three-note chord can be
       genuinely loud without the peak tearing.

   The AudioContext is created lazily inside the gesture that needs it. Browsers
   refuse to start audio outside a user gesture and every cue here follows a
   tap, so the autoplay policy is never tripped.
   -------------------------------------------------------------------------- */

const STORAGE_KEY = "wealthify.paymentFeedback";

/* Gains are deliberately high — a payment app should be *heard*. The
   compressor below is what keeps that from turning into clipping, and the
   volume preference is what keeps it from turning into a nuisance. */
const CUES = {
  /* A digit on the PIN pad. Two layers: filtered noise for the mechanical
     click, a high square for the contact. */
  key: {
    noise: [{ ms: 26, gain: 0.26, highpass: 1_100, q: 0.7 }],
    tones: [{ freq: 2_480, ms: 18, gain: 0.2, type: "square" }],
  },
  /* Backspace: the same click, muted and lower, so it reads as undoing. */
  keyDelete: {
    noise: [{ ms: 30, gain: 0.18, lowpass: 1_600 }],
    tones: [{ freq: 1_160, ms: 26, gain: 0.14, type: "square" }],
  },
  /* One line of the payment sequence. Quiet by design — it fires ten times in
     a row — and single-voice, because this is the most-repeated cue in the app
     and the detuned pair that makes the others sound physical would cost four
     oscillators per tick for an effect nobody can hear 380ms apart. */
  step: {
    tones: [{ freq: 1_320, ms: 34, gain: 0.11, type: "sine", voices: 1 }],
  },
  /* A UPI collect request arriving. The two-note ping a phone makes when
     someone is asking you for money. */
  request: {
    tones: [
      { freq: 1_174.66, ms: 110, gain: 0.26, type: "triangle" },
      { freq: 1_568.98, ms: 150, gain: 0.24, type: "triangle", delay: 0.13 },
    ],
  },
  /* The charge is in flight: a low hum that rises, unresolved on purpose. */
  processing: {
    tones: [
      { freq: 300, ms: 420, gain: 0.16, type: "sine", endFreq: 420 },
      { freq: 452, ms: 420, gain: 0.07, type: "sine", endFreq: 630 },
    ],
    noise: [{ ms: 380, gain: 0.05, lowpass: 900 }],
  },
  /* Payment approved. A noise transient for the mechanism, a bright major
     triad over it for the money, and a shimmer on top — the same shape as a
     till drawer and a bell happening together. */
  success: {
    noise: [{ ms: 44, gain: 0.4, highpass: 900 }],
    tones: [
      { freq: 1_046.5, ms: 330, gain: 0.36, type: "triangle" },
      { freq: 1_318.51, ms: 380, gain: 0.3, type: "triangle", delay: 0.055 },
      { freq: 1_568.98, ms: 460, gain: 0.28, type: "sine", delay: 0.11 },
      { freq: 2_093, ms: 620, gain: 0.14, type: "sine", delay: 0.15 },
      { freq: 3_139.96, ms: 700, gain: 0.07, type: "sine", delay: 0.19 },
    ],
  },
  /* Money *in*. A rising arpeggio with a shimmer, warm rather than bright, so
     it is distinguishable from a purchase in the same room. */
  credit: {
    tones: [
      { freq: 523.25, ms: 220, gain: 0.34, type: "sine" },
      { freq: 659.25, ms: 240, gain: 0.32, type: "sine", delay: 0.09 },
      { freq: 783.99, ms: 300, gain: 0.3, type: "sine", delay: 0.18 },
      { freq: 1_046.5, ms: 520, gain: 0.22, type: "sine", delay: 0.27 },
      { freq: 2_093, ms: 600, gain: 0.06, type: "sine", delay: 0.3 },
    ],
  },
  /* Money out. Firm, descending, confirmed, not celebratory. */
  debit: {
    tones: [
      { freq: 392, ms: 180, gain: 0.32, type: "triangle" },
      { freq: 293.66, ms: 300, gain: 0.3, type: "triangle", delay: 0.12 },
      { freq: 196, ms: 420, gain: 0.18, type: "sine", delay: 0.24 },
    ],
  },
  /* Moving your own money around. Lighter than a purchase: a whoosh and a
     single settling note. */
  transfer: {
    noise: [{ ms: 220, gain: 0.1, highpass: 500, sweep: true }],
    tones: [
      { freq: 587.33, ms: 220, gain: 0.2, type: "sine" },
      { freq: 880, ms: 380, gain: 0.18, type: "sine", delay: 0.1 },
    ],
  },
  /* Work delivered: a soft double chime, like a notification you were hoping
     for. It plays when a timer finishes and the Transfer button appears. */
  ready: {
    tones: [
      { freq: 880, ms: 180, gain: 0.24, type: "sine" },
      { freq: 1_318.51, ms: 420, gain: 0.2, type: "sine", delay: 0.12 },
    ],
  },
  /* Declined. A low double buzz — nothing about it should be mistakable for
     an approval. */
  error: {
    tones: [
      { freq: 174.61, ms: 260, gain: 0.3, type: "sawtooth" },
      { freq: 146.83, ms: 380, gain: 0.26, type: "sawtooth", delay: 0.18 },
    ],
    noise: [{ ms: 300, gain: 0.08, lowpass: 500 }],
  },
};

/* Patterns are a phone's own vocabulary: a key is one tick, a failure is a
   repeated thud, money arriving is a short flourish.

   `step` deliberately has no pattern. It fires once per line of the payment
   sequence, and a device that buzzes ten times while you wait to see whether
   you were charged is not immersive, it is a nuisance. Haptics here mark
   *decisions and outcomes*, never progress. */
const HAPTICS = {
  key: 12,
  keyDelete: [8, 20, 8],
  request: [14, 60, 14],
  success: [24, 40, 16, 40, 48],
  credit: [18, 40, 26],
  debit: [28, 40, 14],
  transfer: [14, 30, 20],
  ready: [12, 50, 12],
  error: [60, 60, 60],
};

/* Which cues may vibrate when the OS asks for reduced motion. Progress and
   interaction cues are feedback you can live without; whether money moved is
   not. */
const ESSENTIAL_HAPTICS = new Set(["success", "credit", "error", "debit"]);

/* Quiet still has to be audible, and loud has to be worth choosing. The base
   gains above sit between the two. */
const VOLUMES = { quiet: 0.4, normal: 0.85, loud: 1.35 };

const DEFAULTS = Object.freeze({
  sound: true,
  haptics: true,
  volume: "normal",
  soundSupported: false,
  hapticsSupported: false,
});

let audio = null;
let noiseBuffer = null;
let lastStepAt = 0;
let reducedMotion = false;

if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  reducedMotion = query.matches;
  // Some users flip this mid-session; the setting is read, not captured once.
  query.addEventListener?.("change", (event) => {
    reducedMotion = event.matches;
  });
}

function context() {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? window.webkitAudioContext;
  if (!Ctor) return null;

  if (!audio) {
    const ctx = new Ctor();

    /* One compressor for the whole app. A three-note chord at these gains
       peaks well past 1.0; the compressor is what turns that into something
       loud that still sounds like the intended chord instead of a crackle. */
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-14, ctx.currentTime);
    compressor.knee.setValueAtTime(8, ctx.currentTime);
    compressor.ratio.setValueAtTime(4, ctx.currentTime);
    compressor.attack.setValueAtTime(0.004, ctx.currentTime);
    compressor.release.setValueAtTime(0.22, ctx.currentTime);

    // `level()` rather than a constant: the context is only ever created inside
    // a tap, which is always after the stored preference has been read, so the
    // first sound already plays at the volume the user chose.
    const master = ctx.createGain();
    master.gain.setValueAtTime(level(), ctx.currentTime);

    master.connect(compressor).connect(ctx.destination);
    audio = { ctx, master };
  }

  // Safari suspends a context created before the first gesture.
  if (audio.ctx.state === "suspended") audio.ctx.resume().catch(() => {});
  return audio;
}

function noise(ctx) {
  if (noiseBuffer) return noiseBuffer;
  const length = Math.round(ctx.sampleRate * 0.5);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

/* `voices` is 2 by default: a detuned pair beating against each other is what
   makes a tone sound struck rather than generated. Cues that repeat rapidly
   drop to 1 — see the `step` table entry. */
function tone(ctx, master, { freq, ms, gain, type, delay = 0, endFreq, detune = 7, voices = 2 }) {
  const start = ctx.currentTime + delay;
  const duration = ms / 1000;

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.006);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  amp.connect(master);

  const offsets = voices === 1 ? [0] : [0, detune];
  for (const cents of offsets) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.detune.setValueAtTime(cents, start);
    osc.frequency.setValueAtTime(freq, start);
    // A rising or falling pitch is what separates "connecting" from "done".
    if (endFreq && endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(endFreq, start + duration);
    }
    osc.connect(amp);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }
}

/* Creating the context, the compressor and the master gain on the very first
   cue means the first PIN press pays for all three — and on a slow phone that
   press is the one the user is listening for. Warming it on the first pointer
   down anywhere moves that cost to a moment nothing is being judged. */
let warmed = false;
function warmAudio() {
  if (warmed) return;
  warmed = true;
  context();
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", warmAudio, { once: true, passive: true });

  /* A hidden tab does not suspend the context on its own, so a long-running
     timer keeps a live audio graph for nobody. Suspending releases the audio
     thread; the resume on return is instant because nothing was torn down. */
  document.addEventListener("visibilitychange", () => {
    if (!audio) return;
    if (document.hidden) audio.ctx.suspend().catch(() => {});
    else audio.ctx.resume().catch(() => {});
  });
}

function burst(ctx, master, { ms, gain, delay = 0, highpass, lowpass, q }) {
  const start = ctx.currentTime + delay;
  const duration = ms / 1000;

  const source = ctx.createBufferSource();
  source.buffer = noise(ctx);

  const filter = ctx.createBiquadFilter();
  filter.type = highpass ? "highpass" : "lowpass";
  filter.frequency.setValueAtTime(highpass ?? lowpass ?? 1_000, start);
  if (q) filter.Q.setValueAtTime(q, start);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(gain, start);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  source.connect(filter).connect(amp).connect(master);
  source.start(start);
  source.stop(start + duration + 0.02);
}

/* --- External store --------------------------------------------------------
   Preferences live in a module-level store read through useSyncExternalStore
   rather than useState + useEffect. localStorage is genuinely an external
   store, and hydrating it from an effect would write state synchronously
   during that effect. The server snapshot is the frozen default, so the server
   and the first client render always agree and hydration never mismatches. */

let snapshot = DEFAULTS;
let hydrated = false;
const listeners = new Set();

function emit() {
  for (const listener of listeners) listener();
}

function level() {
  return VOLUMES[snapshot.volume] ?? VOLUMES.normal;
}

function applyGain() {
  if (!audio) return;
  audio.master.gain.setTargetAtTime(level(), audio.ctx.currentTime, 0.01);
}

function playCue(name) {
  const cue = CUES[name];
  if (!cue) return;
  // Sound from a tab nobody is looking at is noise from another room.
  if (typeof document !== "undefined" && document.hidden) return;

  /* The sequence tick is the one cue that can double-fire: a slow frame, a
     remount, a retry. Two ticks inside a beat read as a glitch, so the second
     is dropped rather than played louder. */
  if (name === "step") {
    const now = Date.now();
    if (now - lastStepAt < 120) return;
    lastStepAt = now;
  }

  const current = context();
  if (!current) return;
  const { ctx, master } = current;

  for (const note of cue.tones ?? []) tone(ctx, master, note);
  for (const hit of cue.noise ?? []) burst(ctx, master, hit);
}

function buzz(name) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  // Under reduced motion, only the outcome cues are worth interrupting for.
  if (reducedMotion && !ESSENTIAL_HAPTICS.has(name)) return;
  const pattern = HAPTICS[name];
  if (!pattern) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers expose vibrate but refuse it in an iframe or without a
    // user gesture. A refused vibration is not worth surfacing.
  }
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
      volume: VOLUMES[parsed.volume] ? parsed.volume : "normal",
    };
  } catch {
    return null;
  }
}

function subscribe(listener) {
  listeners.add(listener);

  // The first subscriber does the one-time read. Doing it here rather than in
  // an effect keeps the write out of React's render/commit path.
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
      JSON.stringify({
        sound: snapshot.sound,
        haptics: snapshot.haptics,
        volume: snapshot.volume,
      }),
    );
  } catch {
    // Private mode with storage disabled: the preference still applies for this
    // session, it just will not be remembered.
  }
  applyGain();
  emit();
}

const FeedbackContext = createContext({
  sound: true,
  haptics: true,
  volume: "normal",
  supported: { sound: false, haptics: false },
  setSound: () => {},
  setHaptics: () => {},
  setVolume: () => {},
  play: () => {},
});

export function PaymentFeedbackProvider({ children }) {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setSound = useCallback((value) => {
    const next = Boolean(value);
    writePrefs({ sound: next });
    // Turning sound *on* should demonstrate itself, otherwise the toggle looks
    // like it did nothing.
    if (next) playCue("key");
  }, []);
  const setHaptics = useCallback((value) => {
    const next = Boolean(value);
    writePrefs({ haptics: next });
    if (next) buzz("key");
  }, []);
  const setVolume = useCallback((value) => {
    if (!VOLUMES[value]) return;
    writePrefs({ volume: value });
    applyGain();
    // Preview at the new level so the choice is audible while it is being made.
    playCue("success");
  }, []);

  /* One call site for every cue, so a payment can never be heard but not felt
     or vice versa — the two toggles are read together, once. */
  const play = useCallback((name) => {
    const current = snapshot;
    if (current.sound) playCue(name);
    if (current.haptics) buzz(name);
  }, []);

  const value = useMemo(
    () => ({
      sound: prefs.sound,
      haptics: prefs.haptics,
      volume: prefs.volume,
      supported: { sound: prefs.soundSupported, haptics: prefs.hapticsSupported },
      setSound,
      setHaptics,
      setVolume,
      play,
    }),
    [prefs, setSound, setHaptics, setVolume, play],
  );

  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>;
}

export const usePaymentFeedback = () => useContext(FeedbackContext);
