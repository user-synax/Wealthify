/* ----------------------------------------------------------------------------
   Income catalog: the career ladder, freelance gigs and daily tasks.

   Same authority rule as the store — the client references an `id`, the price
   and the clock live here, and every reward is recalculated server-side on the
   way in. Nothing in this file can be influenced by a request body.

   Anti-farming (PRD section 9) is enforced in three layers: a per-cycle cap on
   how many jobs can be taken, the three-slot limit on work in flight, and a
   hard cap on daily task payouts. The slot limit is the one the user actually
   feels — it is a pacing device, not a punishment — and the caps are what stop
   an automated client.
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
   A gig is no longer a button that pays instantly. Starting one opens a real
   timer: the client's brief is yours, `durationSec` is how long the work takes
   in real seconds, and the money only becomes yours once the timer runs out and
   you transfer it out of the client's escrow.

   `skill` + `level` gate the board. The three Lv0 jobs are open to everyone —
   and there are exactly three of them, so a brand new account holding no
   skills at all can still fill all three of its slots without paying for a
   course first. Everything above them is locked behind a course the user had
   to buy and wait out. */
export const GIGS = [
  {
    id: "delivery-runs",
    name: "Delivery runs",
    icon: "Scooter",
    skill: "logistics",
    level: 0,
    difficulty: "Easy",
    reward: rupees(500),
    durationSec: 20,
    xp: 14,
    blurb: "An evening of pickups and drop-offs for a local courier.",
  },
  {
    id: "tutoring",
    name: "Tutoring session",
    icon: "GraduationCap",
    skill: "writing",
    level: 0,
    difficulty: "Easy",
    reward: rupees(1_100),
    durationSec: 40,
    xp: 22,
    blurb: "One session with a school student. Steady, reliable money.",
  },
  {
    id: "flyer-drop",
    name: "Flyer drop",
    icon: "ShareNetwork",
    skill: "logistics",
    level: 0,
    difficulty: "Easy",
    reward: rupees(700),
    durationSec: 30,
    xp: 16,
    blurb: "Two hundred flyers through the right letterboxes.",
  },
  {
    id: "social-posts",
    name: "Social media posts",
    icon: "Megaphone",
    skill: "marketing",
    level: 1,
    difficulty: "Easy",
    reward: rupees(2_200),
    durationSec: 55,
    xp: 30,
    blurb: "A week of posts for a cafe that has never had a content plan.",
  },
  {
    id: "storefront-setup",
    name: "Storefront setup",
    icon: "Storefront",
    skill: "logistics",
    level: 2,
    difficulty: "Medium",
    reward: rupees(5_000),
    durationSec: 100,
    xp: 45,
    blurb: "Stock, shelves and a delivery route for a new shop.",
  },
  {
    id: "blog-article",
    name: "Blog article",
    icon: "Notebook",
    skill: "writing",
    level: 2,
    difficulty: "Medium",
    reward: rupees(4_200),
    durationSec: 90,
    xp: 42,
    blurb: "1,500 words researched, written and filed before the deadline.",
  },
  {
    id: "logo-brief",
    name: "Logo & brand brief",
    icon: "PaintBrush",
    skill: "design",
    level: 2,
    difficulty: "Medium",
    reward: rupees(5_600),
    durationSec: 110,
    xp: 48,
    blurb: "A mark and two revisions, delivered by morning.",
  },
  {
    id: "photo-shoot",
    name: "Product photo shoot",
    icon: "Camera",
    skill: "media",
    level: 2,
    difficulty: "Medium",
    reward: rupees(6_400),
    durationSec: 130,
    xp: 50,
    blurb: "Forty shots on white, retouched and handed over.",
  },
  {
    id: "landing-page",
    name: "Landing page build",
    icon: "Code",
    skill: "code",
    level: 3,
    difficulty: "Hard",
    reward: rupees(13_000),
    durationSec: 190,
    xp: 72,
    blurb: "A launch page that has to be live before the campaign starts.",
  },
  {
    id: "ad-campaign",
    name: "Ad campaign setup",
    icon: "ChartPieSlice",
    skill: "marketing",
    level: 3,
    difficulty: "Hard",
    reward: rupees(15_000),
    durationSec: 210,
    xp: 78,
    blurb: "Audiences, creative and a budget the client will actually defend.",
  },
  {
    id: "brand-system",
    name: "Full brand system",
    icon: "Palette",
    skill: "design",
    level: 4,
    difficulty: "Hard",
    reward: rupees(27_000),
    durationSec: 300,
    xp: 112,
    blurb: "Type, colour, motion and a handbook nobody will read.",
  },
  {
    id: "video-series",
    name: "Video series edit",
    icon: "VideoCamera",
    skill: "media",
    level: 4,
    difficulty: "Hard",
    reward: rupees(29_000),
    durationSec: 310,
    xp: 120,
    blurb: "Six episodes cut, graded and captioned for a launch.",
  },
  {
    id: "app-feature",
    name: "App feature sprint",
    icon: "Toolbox",
    skill: "code",
    level: 4,
    difficulty: "Hard",
    reward: rupees(35_000),
    durationSec: 330,
    xp: 132,
    blurb: "A shipped feature with tests, in someone else's codebase.",
  },
  {
    id: "consulting",
    name: "Weekend consulting",
    icon: "Briefcase",
    skill: "marketing",
    level: 5,
    difficulty: "Premium",
    reward: rupees(50_000),
    durationSec: 400,
    xp: 165,
    blurb: "Advisory work at a rate only a specialist can quote.",
  },
];

export const GIGS_BY_ID = new Map(GIGS.map((g) => [g.id, g]));

export const GIGS_PER_CYCLE_CAP = 60;

/* How many jobs and courses can be in flight at once. Three is enough that a
   skilled freelancer can stack overlapping timers, and few enough that the
   board still feels like a choice. */
export const ENGAGEMENT_SLOTS = 3;

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
