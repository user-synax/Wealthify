import mongoose from "mongoose";

/* ----------------------------------------------------------------------------
   An engagement is anything the user has started that finishes later.

   Both halves of the income loop are the same object with a different `kind`:

     gig     — the reward is money, and settling it *transfers* it to the wallet
     course  — the reward is a skill level, and settling it *grants* the level

   They share a lifecycle because they share a problem. Both are "I committed
   real time to something, it is not done yet, and the payout is not mine until
   I come back for it". Modelling them as one collection means one timer, one
   slot counter, one cap and one piece of UI that has to be right.

   `settled` is a terminal boolean rather than a status enum on purpose: the
   running/ready distinction is *derived* from `finishesAt`, so there is no
   background job anywhere that has to flip a row from "working" to "done". A
   server that was asleep for the whole duration still reports the truth the
   moment it is asked.
   -------------------------------------------------------------------------- */

const engagementSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    kind: { type: String, enum: ["gig", "course"], required: true },

    /* The catalog id this run came from: a gig id, or a course id such as
       `design-l2`. Together with `userId` it identifies the engagement. */
    refId: { type: String, required: true },

    title: { type: String, required: true },
    icon: { type: String, default: "Briefcase" },

    // The skill the run exercises, and the level the user held when it started
    // (for a gig) or the level it will grant (for a course).
    skillId: { type: String, required: true },
    level: { type: Number, default: 0, min: 0 },

    // Money and progression the run is worth. For a course `reward` is 0 and
    // the payout is `level` instead.
    reward: { type: Number, default: 0, min: 0 },
    xp: { type: Number, default: 0, min: 0 },

    startedAt: { type: Date, required: true },
    finishesAt: { type: Date, required: true },

    settled: { type: Boolean, default: false },
    settledAt: { type: Date, default: null },

    // Set once a gig payout has been transferred, so the receipt is reachable
    // from the engagement as well as from the ledger.
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction", default: null },

    /* The idempotency key that settled this run. A retry of the *same* transfer
       is answered with the original receipt; a different key gets a plain
       "already collected". Without this the row could not tell the two apart,
       and re-posting with a fresh key would credit the payout twice. */
    settleKey: { type: String, default: null },
  },
  { timestamps: true },
);

// The page's hot query: "everything of mine that is not settled yet".
engagementSchema.index({ userId: 1, settled: 1, finishesAt: 1 });

/* One live run per catalog entry, enforced by the database rather than by a
   read-then-write check. Two taps that race each other both pass the check and
   both insert; the unique partial index turns the loser into a duplicate key
   error instead of a duplicated job. A *settled* run is excluded from the
   index, so the same gig (or the same course level) can be run again later
   while a finished-but-uncollected one still blocks a restart. */
engagementSchema.index(
  { userId: 1, refId: 1 },
  { unique: true, partialFilterExpression: { settled: false } },
);

export const Engagement = mongoose.model("Engagement", engagementSchema);
