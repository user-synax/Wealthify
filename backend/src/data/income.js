/* ----------------------------------------------------------------------------
   Income catalog: the career ladder, freelance gigs and daily tasks.

   Same authority rule as the store — the client references an `id`, the tier
   and cooldown live here, and every reward is recalculated server-side on the
   way in. Nothing in this file can be influenced by a request body.

   Anti-farming (PRD section 9) is enforced in three layers: a per-gig cooldown
   the server times itself, a per-cycle cap on how many gigs can be worked, and
   a hard cap on daily task payouts. The cooldown is the only one the user
   feels; the caps are what stop an automated client.
   -------------------------------------------------------------------------- */

const rupees = (value) => Math.round(value * 100);

/* --- Career ladder ---------------------------------------------------------
   Promotions are earned, never bought: `xpRequired` is the lifetime XP gate
   and the ladder is walked in order. Salary is credited automatically when a
   new simulated cycle begins (see services/clock.js), which is what makes the
   chosen career matter rather than being a label. */
export const CAREERS = [
  {
    title: "Intern",
    salaryPerCycle: rupees(18_000),
    xpRequired: 0,
    blurb: "Learning the ropes. Rent takes most of it.",
  },
  {
    title: "Junior",
    salaryPerCycle: rupees(34_000),
    xpRequired: 400,
    blurb: "First real paycheque. Start the emergency fund.",
  },
  {
    title: "Mid",
    salaryPerCycle: rupees(58_000),
    xpRequired: 1_200,
    blurb: "Comfortable. This is where investing starts to matter.",
  },
  {
    title: "Senior",
    salaryPerCycle: rupees(92_000),
    xpRequired: 2_600,
    blurb: "Property and equity are now in reach.",
  },
  {
    title: "Lead",
    salaryPerCycle: rupees(1_45_000),
    xpRequired: 5_200,
    blurb: "Managing people as well as money.",
  },
  {
    title: "Executive",
    salaryPerCycle: rupees(2_40_000),
    xpRequired: 9_000,
    blurb: "The top of this ladder. Net worth is the scoreboard now.",
  },
];

export function careerIndex(title) {
  const index = CAREERS.findIndex((c) => c.title === title);
  return index === -1 ? 0 : index;
}

export function careerFor(title) {
  return CAREERS[careerIndex(title)];
}

/* Highest tier the user's XP qualifies for, plus whether that is a step up.
   Promotion is automatic on the next economy sync — no ceremony, just a
   ledger entry and a toast, which is how a real payslip upgrade lands. */
export function resolveCareer({ career, xp }) {
  let index = careerIndex(career);
  while (index + 1 < CAREERS.length && xp >= CAREERS[index + 1].xpRequired) {
    index += 1;
  }
  return {
    current: CAREERS[index],
    next: CAREERS[index + 1] ?? null,
    promoted: CAREERS[index].title !== career,
    progressToNext: CAREERS[index + 1]
      ? Math.min(1, xp / CAREERS[index + 1].xpRequired)
      : 1,
  };
}

/* --- Freelance gigs --------------------------------------------------------
   Short, repeatable actions the user can take right now. `cooldownSec` is real
   time, measured from the server's record of the last completion. */
export const GIGS = [
  {
    id: "delivery-runs",
    name: "Delivery runs",
    icon: "Scooter",
    difficulty: "Easy",
    reward: rupees(450),
    cooldownSec: 30,
    xp: 12,
    blurb: "An evening of picking up and dropping off.",
  },
  {
    id: "tutoring",
    name: "Tutoring session",
    icon: "GraduationCap",
    difficulty: "Easy",
    reward: rupees(900),
    cooldownSec: 75,
    xp: 20,
    blurb: "One hour with a school student. Steady, reliable money.",
  },
  {
    id: "design-brief",
    name: "Freelance design brief",
    icon: "PaintBrush",
    difficulty: "Medium",
    reward: rupees(2_400),
    cooldownSec: 150,
    xp: 34,
    blurb: "A logo and two revisions, delivered by morning.",
  },
  {
    id: "consulting",
    name: "Weekend consulting",
    icon: "Briefcase",
    difficulty: "Hard",
    reward: rupees(6_000),
    cooldownSec: 300,
    xp: 55,
    blurb: "Four hours of advisory work at a premium rate.",
  },
];

export const GIGS_BY_ID = new Map(GIGS.map((g) => [g.id, g]));

export const GIGS_PER_CYCLE_CAP = 40;

/* --- Daily tasks ----------------------------------------------------------
   Capped per *real* day (not per cycle) so the cap cannot be reset by the
   simulated clock, and the streak is a real-day streak for the same reason.
   Reward scales with the streak, which is the only place a streak pays out. */
export const TASKS = [
  {
    id: "review-budget",
    name: "Review your budget",
    icon: "ChartPieSlice",
    reward: rupees(150),
    xp: 8,
    blurb: "Open the expenses breakdown and check what is due.",
  },
  {
    id: "market-watch",
    name: "Check the market board",
    icon: "TrendUp",
    reward: rupees(200),
    xp: 10,
    blurb: "Watch the simulated market close before you trade.",
  },
  {
    id: "log-spend",
    name: "Log today's spending",
    icon: "Notebook",
    reward: rupees(120),
    xp: 6,
    blurb: "Write down what today actually cost you.",
  },
];

export const TASKS_BY_ID = new Map(TASKS.map((t) => [t.id, t]));

export const TASKS_PER_DAY_CAP = 3;

// Streak bonus: +8% per consecutive day, capped at +40%.
export function streakBonusPct(streak) {
  return Math.min(Math.max(streak - 1, 0) * 8, 40);
}

/* Reward variance. Deterministic per (gig, completion count) rather than
   random, so replaying the same idempotency key cannot be used to reroll for
   a better payout, and a retried request cannot produce a different number. */
export function variancePct(seed) {
  const hash = [...String(seed)].reduce(
    (acc, char) => (acc * 31 + char.charCodeAt(0)) % 10_007,
    7,
  );
  return (hash % 21) - 10; // -10% .. +10%
}

export function applyPct(amount, pct) {
  return Math.max(1, Math.round((amount * (100 + pct)) / 100));
}
