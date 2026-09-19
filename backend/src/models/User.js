import mongoose from "mongoose";

/* ----------------------------------------------------------------------------
   User + progression + payment credential.

   The payment PIN is a bcrypt hash and never leaves the server; `paymentPinSet`
   is the plain flag the client is allowed to see, so no route ever has to read
   the secret just to answer "has this user set a PIN yet".

   Simulated-clock state lives here too: `simStartedAt` plus the cached
   `cycle` are what services/clock.js advances. Caching the cycle means a
   salary credit or a streak rollover happens exactly once per cycle even
   though the sync runs on every economy request.
   -------------------------------------------------------------------------- */
const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
      match: /^[a-zA-Z0-9_]+$/,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: false },
    avatar: { type: String, default: "" },
    bio: { type: String, default: "", maxlength: 160, trim: true },
    level: { type: Number, default: 1, min: 1 },
    xp: { type: Number, default: 0, min: 0 },
    career: { type: String, default: "Intern" },

    /* --- Payment credential --- */
    paymentPinHash: { type: String, default: "", select: false },
    paymentPinSet: { type: Boolean, default: false },
    pinAttempts: { type: Number, default: 0, min: 0 },
    pinLockedUntil: { type: Date, default: null },

    /* --- Simulated clock --- */
    simStartedAt: { type: Date, default: () => new Date() },
    cycle: { type: Number, default: 0, min: 0 },
    lastCycleAt: { type: Date, default: () => new Date() },

    /* --- Engagement --- */
    streak: { type: Number, default: 0, min: 0 },
    bestStreak: { type: Number, default: 0, min: 0 },
    taskDay: { type: String, default: "" },
    tasksToday: { type: Number, default: 0, min: 0 },
    gigsThisCycle: { type: Number, default: 0, min: 0 },

    /* Earned skills, `skillId -> level`. Stored on the user rather than in its
       own collection because every gig projection needs all of it at once and
       it is read on nearly every income request. Levels only ever move up, and
       only from a settled course. */
    skills: { type: Map, of: Number, default: () => new Map() },
  },
  { timestamps: true },
);

export const User = mongoose.models.User ?? mongoose.model("User", userSchema);
