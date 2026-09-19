import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/auth.js";
import { badRequest, notFound, tooMany } from "../utils/http-error.js";
import { Engagement } from "../models/Engagement.js";
import {
  GIGS_BY_ID,
  GIGS_PER_CYCLE_CAP,
  TASKS,
  TASKS_BY_ID,
  TASKS_PER_DAY_CAP,
  applyPct,
  careerFor,
  resolveCareer,
  streakBonusPct,
} from "../data/income.js";
import {
  COURSE_LEVELS,
  SKILLS,
  SKILL_LEVEL_MAX,
  courseFor,
  parseCourseId,
  skillLevel,
  totalSkillLevels,
} from "../data/skills.js";
import { careerJson, buildReceipt } from "../services/receipts.js";
import { postEntry } from "../services/ledger.js";
import { awardXp, levelForXp, syncEconomy } from "../services/economy.js";
import { verifyPin } from "../services/payments.js";
import { daysBetweenKeys, realDayKey } from "../services/clock.js";
import {
  bonusContext,
  collectCourse,
  engagementJson,
  gigBoard,
  pendingPayout,
  slotState,
  startCourse,
  startGig,
  transferGig,
  transferReady,
} from "../services/engagements.js";

export const incomeRouter = Router();
incomeRouter.use(requireAuth);

/* Starting work is still the most repeatable action in the app, so it keeps its
   limiter. The real gates are the slot count and the per-cycle job cap; this
   only stops a script from opening engagements faster than a person could. */
const workLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Take a breath between jobs." } },
});

const isIdempotencyKey = (value) =>
  typeof value === "string" && /^[\w:-]{8,120}$/.test(value);

/* --- Shared reads ---------------------------------------------------------- */

async function loadOpen(userId) {
  const rows = await Engagement.find({ userId, settled: false }).sort({ finishesAt: 1 });
  return { rows, byRef: new Map(rows.map((row) => [row.refId, row])) };
}

/** One skill card: where the user is, and what the next step costs. */
function skillView(skill, user, { rows, wallet, now }) {
  const level = skillLevel(user.skills, skill.id);
  const run = rows.find((row) => row.kind === "course" && row.skillId === skill.id) ?? null;
  const next = level < SKILL_LEVEL_MAX ? courseFor(skill.id, level + 1) : null;

  return {
    id: skill.id,
    name: skill.name,
    icon: skill.icon,
    accent: skill.accent,
    blurb: skill.blurb,
    level,
    maxLevel: SKILL_LEVEL_MAX,
    course: next
      ? {
          ...next,
          affordable: wallet.cashBalance >= next.cost,
          shortfall: Math.max(0, next.cost - wallet.cashBalance),
        }
      : null,
    run: run ? engagementJson(run, now) : null,
  };
}

/* GET /api/income — everything the income page renders in one call. */
incomeRouter.get("/", async (req, res, next) => {
  try {
    const { wallet, cycle, clock, notices } = await syncEconomy(req.user);
    const now = Date.now();
    const bonusPct = await bonusContext(req.user._id);
    const career = resolveCareer({ career: req.user.career, xp: req.user.xp });

    const today = realDayKey(now);
    const tasksToday = req.user.taskDay === today ? req.user.tasksToday : 0;

    const nextCycleAt = new Date(clock.nextCycleAt).getTime();
    const salaryReady = wallet.lastSalaryCycle < cycle;

    const { rows, byRef } = await loadOpen(req.user._id);
    const slots = await slotState(req.user._id, now);

    return res.json({
      wallet,
      clock,
      notices,
      career: {
        ...careerJson(req.user, career),
        xp: req.user.xp,
        level: req.user.level,
        levelStartXp: (req.user.level - 1) * 500,
        levelNextXp: req.user.level * 500,
      },
      salary: {
        ready: salaryReady,
        dueCycles: Math.max(0, cycle - wallet.lastSalaryCycle),
        perCycle: careerFor(req.user.career).salaryPerCycle,
        nextAt: new Date(nextCycleAt).toISOString(),
        note: salaryReady
          ? "Your paycheque is waiting."
          : "Salary is credited automatically when the simulated month turns over.",
      },
      streak: {
        current: req.user.streak,
        best: req.user.bestStreak,
        bonusPct: streakBonusPct(req.user.streak),
      },

      totalSkillLevels: totalSkillLevels(req.user.skills),
      courseLevels: COURSE_LEVELS,
      skills: SKILLS.map((skill) => skillView(skill, req.user, { rows, wallet, now })),

      gigs: gigBoard(req.user, { bonusPct, openByRef: byRef }),
      engagements: rows.map((row) => engagementJson(row, now)),
      pending: await pendingPayout(req.user._id, now),
      slots,
      gigCap: { used: req.user.gigsThisCycle, max: GIGS_PER_CYCLE_CAP },

      tasks: TASKS.map((task) => ({
        id: task.id,
        name: task.name,
        icon: task.icon,
        blurb: task.blurb,
        xp: task.xp,
        baseReward: task.reward,
        expectedReward: applyPct(task.reward, streakBonusPct(req.user.streak)),
        done: tasksToday >= TASKS_PER_DAY_CAP,
      })),
      taskCap: { used: tasksToday, max: TASKS_PER_DAY_CAP },
    });
  } catch (err) {
    return next(err);
  }
});

/* --- The board ------------------------------------------------------------- */

/* POST /api/income/gigs/:id/start
   Opens a timed engagement. No money moves here — that is the entire point.
   Three slots, one live run per job, and the quote is fixed at this moment. */
incomeRouter.post("/gigs/:id/start", workLimiter, async (req, res, next) => {
  try {
    const gig = GIGS_BY_ID.get(req.params.id);
    if (!gig) throw notFound("GIG_NOT_FOUND", { message: "That job is not on the board." });

    const result = await startGig({ user: req.user, gig });

    return res.status(result.replay ? 200 : 201).json({
      engagement: engagementJson(result.engagement),
      replay: result.replay,
      slots: await slotState(req.user._id),
      gigCap: { used: req.user.gigsThisCycle, max: GIGS_PER_CYCLE_CAP },
      clock: result.clock,
    });
  } catch (err) {
    return next(err);
  }
});

/* POST /api/income/courses/:id/enroll
   A course is paid for like anything else in the app — same PIN, same ledger,
   same receipt — and then it runs on its own. Paying is the investment; the
   wait is the cost of not being on the board. */
incomeRouter.post("/courses/:id/enroll", workLimiter, async (req, res, next) => {
  try {
    const parsed = parseCourseId(req.params.id);
    const course = parsed ? courseFor(parsed.skillId, parsed.level) : null;
    if (!course) throw notFound("COURSE_NOT_FOUND", { message: "That course does not exist." });

    const idempotencyKey = req.body?.idempotencyKey;
    if (!isIdempotencyKey(idempotencyKey)) {
      throw badRequest("IDEMPOTENCY_KEY_REQUIRED", { message: "Missing idempotency key." });
    }

    // PIN first, then money: a wrong PIN must not leak whether the balance was
    // sufficient and must not burn the enrollment.
    await verifyPin(req.user, req.body?.pin);

    const result = await startCourse({
      user: req.user,
      course,
      idempotencyKey,
    });

    return res.status(result.replay ? 200 : 201).json({
      receipt: buildReceipt({
        transaction: result.transaction,
        wallet: result.wallet,
        user: req.user,
        cycle: result.cycle,
        extra: {
          merchant: "Wealthify Academy",
          note: `Enrolled. ${course.name} finishes in ${Math.round(course.durationSec)}s.`,
          replay: result.replay,
        },
      }),
      engagement: engagementJson(result.engagement),
      slots: await slotState(req.user._id),
      clock: result.clock,
    });
  } catch (err) {
    return next(err);
  }
});

/* --- Collecting ------------------------------------------------------------ */

/* POST /api/income/engagements/:id/transfer
   A finished job's escrow into the wallet. This is the transfer the whole
   feature exists to make you press, so it is a real ledger entry with a real
   reference and a receipt. */
incomeRouter.post("/engagements/:id/transfer", workLimiter, async (req, res, next) => {
  try {
    const idempotencyKey = req.body?.idempotencyKey;
    if (!isIdempotencyKey(idempotencyKey)) {
      throw badRequest("IDEMPOTENCY_KEY_REQUIRED", { message: "Missing idempotency key." });
    }

    const result = await transferGig({
      user: req.user,
      id: req.params.id,
      idempotencyKey,
    });

    return res.status(201).json({
      receipt: buildReceipt({
        transaction: result.transaction,
        wallet: result.wallet,
        user: req.user,
        cycle: result.cycle,
        extra: {
          merchant: "Freelance client",
          note: "Transferred from escrow into your wallet.",
          replay: result.replay,
        },
      }),
      engagement: engagementJson(result.engagement),
      pending: await pendingPayout(req.user._id),
      slots: await slotState(req.user._id),
      clock: result.clock,
    });
  } catch (err) {
    return next(err);
  }
});

/* POST /api/income/engagements/:id/collect — claim a finished course. */
incomeRouter.post("/engagements/:id/collect", workLimiter, async (req, res, next) => {
  try {
    const result = await collectCourse({ user: req.user, id: req.params.id });

    return res.status(201).json({
      engagement: engagementJson(result.engagement),
      skill: result.skill,
      xp: result.xp,
      leveledUp: result.leveledUp,
      level: result.level,
      slots: await slotState(req.user._id),
      clock: result.clock,
    });
  } catch (err) {
    return next(err);
  }
});

/* POST /api/income/earnings/transfer — transfer everything that is waiting.
   Each payout keeps its own ledger entry, so the batch is as auditable as
   pressing the button three times, and it replays the same way. */
incomeRouter.post("/earnings/transfer", workLimiter, async (req, res, next) => {
  try {
    const idempotencyKey = req.body?.idempotencyKey;
    if (!isIdempotencyKey(idempotencyKey)) {
      throw badRequest("IDEMPOTENCY_KEY_REQUIRED", { message: "Missing idempotency key." });
    }

    const result = await transferReady({ user: req.user, idempotencyKey });
    if (!result.transfers.length) {
      throw tooMany("NOTHING_TO_TRANSFER", {
        message: "Nothing has finished yet. Let the timers run.",
      });
    }

    return res.status(201).json({
      ...result,
      pending: await pendingPayout(req.user._id),
      slots: await slotState(req.user._id),
    });
  } catch (err) {
    return next(err);
  }
});

/* --- Daily tasks -----------------------------------------------------------
   Capped by *real* day so the simulated clock cannot be used to reset it, and
   the streak is a real-day streak for the same reason. */
incomeRouter.post("/tasks/:id/complete", workLimiter, async (req, res, next) => {
  try {
    const task = TASKS_BY_ID.get(req.params.id);
    if (!task) throw notFound("TASK_NOT_FOUND", { message: "That task does not exist." });

    const idempotencyKey = req.body?.idempotencyKey;
    if (!isIdempotencyKey(idempotencyKey)) {
      throw badRequest("IDEMPOTENCY_KEY_REQUIRED", { message: "Missing idempotency key." });
    }

    const { cycle, clock } = await syncEconomy(req.user);
    const now = Date.now();
    const today = realDayKey(now);

    // Roll the day over before checking the cap. A gap of exactly one day
    // continues the streak; anything longer resets it, and an empty taskDay
    // simply means no streak exists yet.
    if (req.user.taskDay !== today) {
      const gap = daysBetweenKeys(req.user.taskDay, today);
      req.user.streak = req.user.taskDay && gap === 1 ? req.user.streak : 0;
      req.user.taskDay = today;
      req.user.tasksToday = 0;
      await req.user.save();
    }

    if (req.user.tasksToday >= TASKS_PER_DAY_CAP) {
      throw tooMany("TASK_CAP_REACHED", {
        message: `You have claimed all ${TASKS_PER_DAY_CAP} tasks today.`,
        details: { cap: TASKS_PER_DAY_CAP, used: req.user.tasksToday },
      });
    }

    const firstToday = req.user.tasksToday === 0;
    const streakAfter = firstToday ? req.user.streak + 1 : Math.max(1, req.user.streak);
    const gross = applyPct(task.reward, streakBonusPct(streakAfter));

    const { transaction, wallet, replay } = await postEntry({
      user: req.user,
      type: "reward",
      direction: "credit",
      amount: gross,
      category: "daily_task",
      description: task.name,
      paymentMethod: "system",
      idempotencyKey: `task:${req.user._id}:${idempotencyKey}`,
      simCycle: cycle,
      metadata: {
        icon: task.icon,
        merchant: "Wealthify Rewards",
        note: `Day ${streakAfter} streak.`,
        items: [
          { label: task.name, amount: task.reward },
          ...(streakBonusPct(streakAfter)
            ? [{ label: `Streak bonus +${streakBonusPct(streakAfter)}%`, amount: gross - task.reward }]
            : []),
        ],
      },
    });

    let leveledUp = false;
    if (!replay) {
      req.user.tasksToday += 1;
      if (firstToday) {
        req.user.streak = streakAfter;
        req.user.bestStreak = Math.max(req.user.bestStreak ?? 0, req.user.streak);
      }
      leveledUp = awardXp(req.user, task.xp);
      await req.user.save();
    }

    return res.status(201).json({
      receipt: buildReceipt({
        transaction,
        wallet,
        user: req.user,
        cycle,
        extra: {
          merchant: "Wealthify Rewards",
          note: firstToday ? `Streak day ${req.user.streak}.` : "Same day, extra task.",
          streak: req.user.streak,
          level: req.user.level ?? levelForXp(req.user.xp),
          leveledUp,
          replay,
        },
      }),
      clock,
      taskCap: { used: req.user.tasksToday, max: TASKS_PER_DAY_CAP },
      streak: { current: req.user.streak, best: req.user.bestStreak },
    });
  } catch (err) {
    return next(err);
  }
});
