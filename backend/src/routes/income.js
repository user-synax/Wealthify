import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/auth.js";
import { badRequest, notFound, tooMany } from "../utils/http-error.js";
import { Inventory } from "../models/Inventory.js";
import {
  GIGS,
  GIGS_BY_ID,
  GIGS_PER_CYCLE_CAP,
  TASKS,
  TASKS_BY_ID,
  TASKS_PER_DAY_CAP,
  applyPct,
  careerFor,
  resolveCareer,
  streakBonusPct,
  variancePct,
} from "../data/income.js";
import { rewardBonusPct } from "../data/catalog.js";
import { careerJson, buildReceipt } from "../services/receipts.js";
import { postEntry } from "../services/ledger.js";
import { awardXp, levelForXp, syncEconomy } from "../services/economy.js";
import { daysBetweenKeys, realDayKey } from "../services/clock.js";

export const incomeRouter = Router();
incomeRouter.use(requireAuth);

/* Working a gig is the most repeatable action in the app, so it is the one
   most worth grinding. The per-gig cooldown below is the real gate; this
   limiter only stops a script from hammering the endpoint faster than a human
   could ever hope to. */
const workLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Take a breath between jobs." } },
});

const isIdempotencyKey = (value) =>
  typeof value === "string" && /^[\w:-]{8,120}$/.test(value);

async function bonusContext(userId) {
  const rows = await Inventory.find({ userId }).select("sku").lean();
  return rewardBonusPct(rows.map((row) => row.sku));
}

function gigView(gig, user, { bonusPct, now }) {
  const last = user.lastGigAt?.get?.(gig.id);
  const lastAt = last ? new Date(last).getTime() : 0;
  const readyAt = lastAt + gig.cooldownSec * 1000;
  const remainingMs = Math.max(0, readyAt - now);

  return {
    id: gig.id,
    name: gig.name,
    icon: gig.icon,
    difficulty: gig.difficulty,
    blurb: gig.blurb,
    cooldownSec: gig.cooldownSec,
    xp: gig.xp,
    baseReward: gig.reward,
    // What the user would actually receive right now, which is what the button
    // should promise. It includes their gear bonus, so buying a laptop visibly
    // raises this number.
    expectedReward: applyPct(gig.reward, bonusPct),
    bonusPct,
    ready: remainingMs === 0,
    readyAt: remainingMs === 0 ? null : new Date(readyAt).toISOString(),
    cooldownRemainingMs: remainingMs,
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
      gigs: GIGS.map((gig) => gigView(gig, req.user, { bonusPct, now })),
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

/* POST /api/income/gigs/:id/work */
incomeRouter.post("/gigs/:id/work", workLimiter, async (req, res, next) => {
  try {
    const gig = GIGS_BY_ID.get(req.params.id);
    if (!gig) throw notFound("GIG_NOT_FOUND", { message: "That job is not on the board." });

    const idempotencyKey = req.body?.idempotencyKey;
    if (!isIdempotencyKey(idempotencyKey)) {
      throw badRequest("IDEMPOTENCY_KEY_REQUIRED", { message: "Missing idempotency key." });
    }

    const { cycle, clock } = await syncEconomy(req.user);
    const now = Date.now();

    if (req.user.gigsThisCycle >= GIGS_PER_CYCLE_CAP) {
      throw tooMany("GIG_CAP_REACHED", {
        message: `You have worked the maximum ${GIGS_PER_CYCLE_CAP} jobs this simulated month.`,
        details: { cap: GIGS_PER_CYCLE_CAP, used: req.user.gigsThisCycle, resetAt: clock.nextCycleAt },
      });
    }

    const last = req.user.lastGigAt?.get?.(gig.id);
    const readyAt = last ? new Date(last).getTime() + gig.cooldownSec * 1000 : 0;
    if (readyAt > now) {
      throw tooMany("GIG_COOLDOWN", {
        message: `${gig.name} needs a moment before it comes round again.`,
        details: { retryInMs: readyAt - now, readyAt: new Date(readyAt).toISOString() },
      });
    }

    const bonusPct = await bonusContext(req.user._id);
    const roll = variancePct(`${gig.id}:${req.user.gigsThisCycle}:${cycle}`);
    const gross = applyPct(applyPct(gig.reward, bonusPct), roll);

    const { transaction, wallet, replay } = await postEntry({
      user: req.user,
      type: "income",
      direction: "credit",
      amount: gross,
      category: "gig",
      description: gig.name,
      paymentMethod: "system",
      idempotencyKey: `gig:${req.user._id}:${idempotencyKey}`,
      simCycle: cycle,
      metadata: {
        icon: gig.icon,
        merchant: "Freelance client",
        note: roll === 0 ? "Paid at the quoted rate." : roll > 0 ? "The client rounded up." : "The client haggled you down.",
        items: [
          { label: gig.name, amount: gig.reward },
          ...(bonusPct ? [{ label: `Gear bonus +${bonusPct}%`, amount: applyPct(gig.reward, bonusPct) - gig.reward }] : []),
          ...(roll ? [{ label: roll > 0 ? "Negotiated up" : "Negotiated down", amount: gross - applyPct(gig.reward, bonusPct) }] : []),
        ],
      },
    });

    let leveledUp = false;
    if (!replay) {
      req.user.gigsThisCycle += 1;
      req.user.lastGigAt.set(gig.id, new Date(now));
      req.user.markModified("lastGigAt");
      leveledUp = awardXp(req.user, gig.xp);
      await req.user.save();
    }

    return res.status(201).json({
      receipt: buildReceipt({
        transaction,
        wallet,
        user: req.user,
        cycle,
        extra: {
          merchant: "Freelance client",
          note: "Credited straight to your available balance.",
          xp: gig.xp,
          leveledUp,
          level: req.user.level,
          replay,
        },
      }),
      clock,
      gig: gigView(gig, req.user, { bonusPct, now: Date.now() }),
      gigCap: { used: req.user.gigsThisCycle, max: GIGS_PER_CYCLE_CAP },
    });
  } catch (err) {
    return next(err);
  }
});

/* POST /api/income/tasks/:id/complete
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

    // Completing a task is what continues the streak, so a first task on a new
    // day is the moment the counter advances.
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
