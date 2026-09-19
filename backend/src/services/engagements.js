import { Engagement } from "../models/Engagement.js";
import { Inventory } from "../models/Inventory.js";
import {
  ENGAGEMENT_SLOTS,
  GIGS,
  GIGS_PER_CYCLE_CAP,
  applyPct,
  variancePct,
} from "../data/income.js";
import {
  SKILLS_BY_ID,
  SKILL_LEVEL_MAX,
  projectGig,
  skillLevel,
  totalSkillLevels,
} from "../data/skills.js";
import { rewardBonusPct } from "../data/catalog.js";
import { Transaction } from "../models/Transaction.js";
import { conflict, forbidden, notFound, tooMany } from "../utils/http-error.js";
import { getWallet, postEntry } from "./ledger.js";
import { awardXp, levelForXp, syncEconomy } from "./economy.js";

/* ----------------------------------------------------------------------------
   The engagement engine.

   Everything the user can "start and come back to" is handled here: freelance
   gigs, whose payout sits in escrow until it is transferred, and courses, which
   hand over a skill level instead of money.

   Three invariants hold this together:

   1. **A run's value is fixed when it starts.** The reward, the duration and
      the skill level are all decided at `start` and written to the row. Coming
      back later cannot change the payout, and the number on the button is the
      number that eventually lands — including the gear bonus and the client's
      haggling.

   2. **Completion is derived, never scheduled.** There is no job queue and no
      cron. `now >= finishesAt` *is* the completion, so a server that was down
      for the whole timer reports the right answer the instant it comes back.

   3. **Money only moves on settle.** Starting work moves nothing. This is the
      whole point of the feature: the wallet changes when the user comes back
      and taps Transfer, not when they tap Start.
   -------------------------------------------------------------------------- */

const MS = (date) => new Date(date).getTime();

/** `active` (still working), `ready` (done, waiting to be collected), `settled`. */
export function engagementStatus(row, now = Date.now()) {
  if (row.settled) return "settled";
  return now >= MS(row.finishesAt) ? "ready" : "active";
}

export function engagementJson(row, now = Date.now()) {
  const startedAt = MS(row.startedAt);
  const finishesAt = MS(row.finishesAt);
  const total = Math.max(1, finishesAt - startedAt);
  const elapsed = Math.min(total, Math.max(0, now - startedAt));

  return {
    id: String(row._id),
    kind: row.kind,
    refId: row.refId,
    title: row.title,
    icon: row.icon,
    skillId: row.skillId,
    level: row.level,
    reward: row.reward,
    xp: row.xp,
    status: engagementStatus(row, now),
    startedAt: new Date(startedAt).toISOString(),
    finishesAt: new Date(finishesAt).toISOString(),
    durationMs: total,
    remainingMs: Math.max(0, finishesAt - now),
    progress: Math.min(1, elapsed / total),
  };
}

/* --- Slots and the escrow --------------------------------------------------
   Only *running* work occupies a slot. A finished job that has not been
   transferred yet stops paying interest but does not block the board, because
   punishing someone for not having tapped Transfer would be a trap, not a
   mechanic. */

export async function slotsUsed(userId, now = Date.now()) {
  return Engagement.countDocuments({
    userId,
    settled: false,
    finishesAt: { $gt: new Date(now) },
  });
}

export async function slotState(userId, now = Date.now()) {
  return { used: await slotsUsed(userId, now), max: ENGAGEMENT_SLOTS };
}

async function assertSlotFree(userId, now) {
  const used = await slotsUsed(userId, now);
  if (used >= ENGAGEMENT_SLOTS) {
    throw tooMany("NO_FREE_SLOT", {
      message: `All ${ENGAGEMENT_SLOTS} of your slots are busy. Finish something first.`,
      details: { used, max: ENGAGEMENT_SLOTS, slots: ENGAGEMENT_SLOTS },
    });
  }
}

/** Money the user has earned but not yet moved into the wallet. */
export async function pendingPayout(userId, now = Date.now()) {
  const rows = await Engagement.find({
    userId,
    kind: "gig",
    settled: false,
    finishesAt: { $lte: new Date(now) },
  })
    .select("reward")
    .lean();
  return {
    amount: rows.reduce((sum, row) => sum + row.reward, 0),
    count: rows.length,
  };
}

export async function bonusContext(userId) {
  const rows = await Inventory.find({ userId }).select("sku").lean();
  return rewardBonusPct(rows.map((row) => row.sku));
}

/* --- Starting a gig -------------------------------------------------------- */

function lockedGig(gig, level) {
  return forbidden("SKILL_REQUIRED", {
    message: `${gig.name} needs ${gig.skill} Lv${gig.level}. You are Lv${level}.`,
    details: { skillId: gig.skill, requiredLevel: gig.level, level },
  });
}

/**
 * Start a freelance job. The quote is computed here and stored on the row, so
 * the client's price, the client's deadline and the haggling roll are all
 * decided once and cannot be re-rolled by retrying the request.
 */
export async function startGig({ user, gig, now = Date.now() }) {
  const total = totalSkillLevels(user.skills);
  const level = skillLevel(user.skills, gig.skill);
  if (level < gig.level) throw lockedGig(gig, level);

  const { cycle, clock } = await syncEconomy(user);

  if (user.gigsThisCycle >= GIGS_PER_CYCLE_CAP) {
    throw tooMany("GIG_CAP_REACHED", {
      message: `You have worked the maximum ${GIGS_PER_CYCLE_CAP} jobs this simulated month.`,
      details: { cap: GIGS_PER_CYCLE_CAP, used: user.gigsThisCycle, resetAt: clock.nextCycleAt },
    });
  }

  await assertSlotFree(user._id, now);

  const bonusPct = await bonusContext(user._id);
  const project = projectGig(gig, { level, totalLevels: total });
  // A deterministic roll, seeded by how much work this account has already
  // done this cycle, so the same job cannot be retried until it pays well.
  const roll = variancePct(`${gig.id}:${user.gigsThisCycle}:${cycle}`);
  const quoted = applyPct(applyPct(gig.reward, project.rewardFactorPct), bonusPct);
  const reward = applyPct(quoted, roll);

  const startedAt = new Date(now);
  const finishesAt = new Date(now + project.durationMs);

  let row;
  try {
    row = await Engagement.create({
      userId: user._id,
      kind: "gig",
      refId: gig.id,
      title: gig.name,
      icon: gig.icon,
      skillId: gig.skill,
      level,
      reward,
      xp: 0,
      startedAt,
      finishesAt,
    });
  } catch (err) {
    // The unique partial index is what actually enforces "one live run per
    // gig". Losing the race means someone else's tap already started it, which
    // is exactly what the second tap wanted, so hand back the live run.
    if (err?.code === 11000) {
      const existing = await Engagement.findOne({
        userId: user._id,
        refId: gig.id,
        settled: false,
      });
      if (existing) {
        return { engagement: existing, replay: true, cycle, clock };
      }
    }
    throw err;
  }

  user.gigsThisCycle += 1;
  await user.save();

  return {
    engagement: row,
    replay: false,
    cycle,
    clock,
    project,
    bonusPct,
    roll,
  };
}

/* --- Enrolling on a course ------------------------------------------------- */

/**
 * Start a course. The fee is charged first because a course that has been paid
 * for but not created is recoverable (retry replays the charge), while a course
 * created but not paid for is a free skill level.
 */
export async function startCourse({ user, course, idempotencyKey, now = Date.now() }) {
  const level = skillLevel(user.skills, course.skillId);

  if (level >= course.level) {
    throw conflict("COURSE_ALREADY_HELD", {
      message: `You are already at ${course.skillName} Lv${level}.`,
    });
  }
  if (level < course.level - 1) {
    throw forbidden("COURSE_LOCKED", {
      message: `${course.name} is the next step after ${course.skillName} Lv${course.level - 1}.`,
      details: { skillId: course.skillId, requiredLevel: course.level - 1, level },
    });
  }

  const live = await Engagement.findOne({
    userId: user._id,
    refId: course.id,
    settled: false,
  });
  if (live) {
    throw conflict("COURSE_IN_PROGRESS", {
      message: `You are already enrolled on ${course.name}.`,
      details: { engagementId: String(live._id) },
    });
  }

  await assertSlotFree(user._id, now);

  const { cycle, clock } = await syncEconomy(user);

  const { transaction, wallet, replay } = await postEntry({
    user,
    type: "expense",
    direction: "debit",
    amount: course.cost,
    category: "course",
    description: course.name,
    paymentMethod: null,
    idempotencyKey: `course:${user._id}:${idempotencyKey}`,
    simCycle: cycle,
    metadata: {
      icon: course.icon,
      merchant: "Wealthify Academy",
      items: [
        {
          label: course.name,
          amount: course.cost,
          note: `${Math.round(course.durationSec)}s of study · +${course.xp} XP`,
        },
      ],
    },
  });

  const startedAt = new Date(now);
  const finishesAt = new Date(now + course.durationSec * 1000);

  let row;
  try {
    row = await Engagement.create({
      userId: user._id,
      kind: "course",
      refId: course.id,
      title: course.name,
      icon: course.icon,
      skillId: course.skillId,
      level: course.level,
      reward: 0,
      xp: course.xp,
      startedAt,
      finishesAt,
    });
  } catch (err) {
    if (err?.code === 11000) {
      const existing = await Engagement.findOne({
        userId: user._id,
        refId: course.id,
        settled: false,
      });
      if (existing) {
        return { engagement: existing, replay: true, transaction, wallet, cycle, clock };
      }
    }
    throw err;
  }

  return { engagement: row, replay, transaction, wallet, cycle, clock, course };
}

/* --- Settling -------------------------------------------------------------- */

async function loadSettleable(userId, id, now) {
  const row = await Engagement.findOne({ _id: id, userId });
  if (!row) throw notFound("ENGAGEMENT_NOT_FOUND", { message: "That job is not yours." });
  if (row.settled) {
    throw conflict("ALREADY_SETTLED", { message: "You have already collected this one." });
  }
  if (now < MS(row.finishesAt)) {
    throw conflict("NOT_READY", {
      message: "That job is still running.",
      details: { remainingMs: MS(row.finishesAt) - now, finishesAt: row.finishesAt },
    });
  }
  return row;
}

/** The receipt for a transfer that already happened, rebuilt from the ledger so
    a retry shows the same reference and the same balance as the first time. */
async function replayTransfer({ user, row }) {
  const { cycle, clock } = await syncEconomy(user);
  const transaction = row.transactionId
    ? await Transaction.findById(row.transactionId)
    : null;
  return {
    engagement: row,
    transaction,
    wallet: await getWallet(user._id),
    cycle,
    clock,
    replay: true,
  };
}

/**
 * Transfer a completed gig's escrow into the wallet.
 *
 * The ledger entry is what actually moves the money; the row is only marked
 * settled afterwards, and the idempotency key means a retry of this exact
 * transfer replays the original entry instead of paying twice.
 */
export async function transferGig({ user, id, idempotencyKey, now = Date.now() }) {
  const derivedKey = `freelance:${user._id}:${idempotencyKey}`;
  const row = await Engagement.findOne({ _id: id, userId: user._id });
  if (!row) throw notFound("ENGAGEMENT_NOT_FOUND", { message: "That job is not yours." });
  if (row.kind !== "gig") {
    throw conflict("NOT_A_GIG", { message: "Courses are collected, not transferred." });
  }

  /* A doubled tap or a retried request must not read as a failure. Same key
     means "this exact transfer" and is answered with the original receipt; a
     different key means the money has genuinely already moved, and saying so is
     the honest answer. */
  if (row.settled) {
    if (row.settleKey === derivedKey) {
      return replayTransfer({ user, row });
    }
    throw conflict("ALREADY_SETTLED", { message: "This payout is already in your wallet." });
  }

  const gig = await loadSettleable(user._id, id, now);

  const { cycle, clock } = await syncEconomy(user);

  const { transaction, wallet, replay } = await postEntry({
    user,
    type: "income",
    direction: "credit",
    amount: gig.reward,
    category: "freelance",
    description: `${gig.title} payout`,
    paymentMethod: null,
    idempotencyKey: derivedKey,
    simCycle: cycle,
    metadata: {
      icon: gig.icon,
      merchant: "Freelance client",
      engagementId: String(gig._id),
      note: "Transferred from your completed work.",
      items: [{ label: gig.title, amount: gig.reward }],
    },
  });

  /* Written even on a replay. If the ledger entry committed and the process
     died before this save, the row is still open and the retry replays the
     entry — marking it settled here is what closes that window instead of
     leaving a payout that can never be collected. */
  gig.settled = true;
  gig.settledAt = gig.settledAt ?? new Date(now);
  gig.transactionId = transaction?._id ?? null;
  gig.settleKey = derivedKey;
  await gig.save();

  return { engagement: gig, transaction, wallet, cycle, clock, replay };
}

/**
 * Collect a finished course. This is the only place in the app where a skill
 * level moves, and it moves by exactly one step per course.
 */
export async function collectCourse({ user, id, now = Date.now() }) {
  const existing = await Engagement.findOne({ _id: id, userId: user._id });
  if (!existing) throw notFound("ENGAGEMENT_NOT_FOUND", { message: "That course is not yours." });
  if (existing.kind !== "course") {
    throw conflict("NOT_A_COURSE", { message: "That is a job, not a course." });
  }

  /* Nothing here needs replay protection: a level is not spent, so a second
     collect has nothing left to grant. It returns the state as it stands, which
     is what a retry after a dropped response wants to see. */
  if (existing.settled) {
    const { clock: settledClock } = await syncEconomy(user);
    return {
      engagement: existing,
      skill: {
        id: existing.skillId,
        from: skillLevel(user.skills, existing.skillId),
        to: skillLevel(user.skills, existing.skillId),
      },
      xp: 0,
      leveledUp: false,
      level: levelForXp(user.xp),
      clock: settledClock,
      replay: true,
    };
  }

  const row = await loadSettleable(user._id, id, now);
  const { clock } = await syncEconomy(user);

  const before = skillLevel(user.skills, row.skillId);
  const after = Math.min(SKILL_LEVEL_MAX, Math.max(before + 1, row.level));
  user.skills.set(row.skillId, after);
  user.markModified("skills");
  const leveledUp = awardXp(user, row.xp);
  await user.save();

  row.settled = true;
  row.settledAt = new Date(now);
  await row.save();

  return {
    engagement: row,
    skill: { id: row.skillId, from: before, to: after },
    xp: row.xp,
    leveledUp,
    level: levelForXp(user.xp),
    clock,
  };
}

/**
 * Transfer everything that is ready, in one tap.
 *
 * Each transfer keeps its own ledger entry and its own key derived from the
 * caller's, so a retry of the whole batch replays exactly the entries it had
 * already created and pays the rest.
 */
export async function transferReady({ user, idempotencyKey, now = Date.now() }) {
  const ready = await Engagement.find({
    userId: user._id,
    kind: "gig",
    settled: false,
    finishesAt: { $lte: new Date(now) },
  }).sort({ finishesAt: 1 });

  const transfers = [];
  let wallet = null;
  let clock = null;

  for (const row of ready) {
    const result = await transferGig({
      user,
      id: row._id,
      idempotencyKey: `${idempotencyKey}:${row._id}`,
      now,
    });
    wallet = result.wallet;
    clock = result.clock;
    transfers.push({
      id: String(row._id),
      title: row.title,
      icon: row.icon,
      amount: row.reward,
      reference: result.transaction?.reference ?? null,
    });
  }

  return {
    transfers,
    total: transfers.reduce((sum, item) => sum + item.amount, 0),
    wallet,
    clock,
  };
}

/* --- Board projection ------------------------------------------------------

   The gig board, priced for whoever is looking at it.

   Everything a card shows is computed the same way `startGig` computes it, so
   the promise on the button and the payout on the receipt cannot drift apart.
   The one thing missing is the haggling roll, which is seeded by the cycle's
   job count and is therefore unknown until the job is actually taken — the
   board quotes the honest price without it. */
export function gigBoard(user, { bonusPct, openByRef }) {
  const total = totalSkillLevels(user.skills);
  return GIGS.map((gig) => {
    const level = skillLevel(user.skills, gig.skill);
    const skill = SKILLS_BY_ID.get(gig.skill);
    const project = projectGig(gig, { level, totalLevels: total });
    const live = openByRef.get(gig.id) ?? null;
    const locked = level < gig.level;

    return {
      id: gig.id,
      name: gig.name,
      icon: gig.icon,
      blurb: gig.blurb,
      difficulty: gig.difficulty,
      skillId: gig.skill,
      skillName: skill?.name ?? gig.skill,
      requiredLevel: gig.level,
      level,
      locked,
      xp: gig.xp,
      baseReward: gig.reward,
      baseDurationSec: gig.durationSec,
      reward: applyPct(applyPct(gig.reward, project.rewardFactorPct), bonusPct),
      rewardFactorPct: project.rewardFactorPct,
      durationMs: project.durationMs,
      durationSavedPct: project.durationSavedPct,
      bonusPct,
      // A job already in flight cannot be started twice; the card turns into a
      // progress row instead of a Start button.
      engagement: live ? engagementJson(live) : null,
    };
  });
}
