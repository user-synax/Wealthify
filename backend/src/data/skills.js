/* ----------------------------------------------------------------------------
   Skills and the courses that level them up.

   Skill is the one progression axis in the app that is *bought and waited for*
   rather than earned by clicking. A course costs money (the investment) and
   takes real time to finish (the cost of not working), which is why the income
   loop reads as a trade-off instead of a button.

   Two rules live here and nowhere else:

     - a course takes you to exactly the next level, never skipping;
     - every duration and price is server-side, so a request body can only ever
       name a course, never describe one.
   -------------------------------------------------------------------------- */

const rupees = (value) => Math.round(value * 100);

export const SKILL_LEVEL_MAX = 5;

export const SKILLS = [
  {
    id: "logistics",
    name: "Logistics",
    icon: "Scooter",
    accent: "sky",
    blurb: "Routes, pickups and getting things where they were promised.",
  },
  {
    id: "writing",
    name: "Writing",
    icon: "Notebook",
    accent: "steel",
    blurb: "Briefs, articles and anything that has to read well.",
  },
  {
    id: "design",
    name: "Design",
    icon: "PaintBrush",
    accent: "peach",
    blurb: "Logos, layouts and brand systems clients approve first time.",
  },
  {
    id: "marketing",
    name: "Marketing",
    icon: "Megaphone",
    accent: "brand-orange",
    blurb: "Campaigns that spend less and bring more back.",
  },
  {
    id: "media",
    name: "Video & photo",
    icon: "VideoCamera",
    accent: "ink",
    blurb: "Shoots, edits and everything a product needs to look expensive.",
  },
  {
    id: "code",
    name: "Programming",
    icon: "Code",
    accent: "primary",
    blurb: "Sites, tools and features you can bill for by the hour.",
  },
];

export const SKILLS_BY_ID = new Map(SKILLS.map((skill) => [skill.id, skill]));

/* One row per level. Index 0 is the starting level and has no course — you
   either know how to deliver a parcel or you do not. Every tier after that is
   strictly more expensive and strictly slower than the one before, so buying
   level 5 in anything is a real commitment rather than a repeat purchase.

   `durationSec` is real seconds. A course runs while you are off doing
   something else, which is exactly why several can run side by side. */
const TIERS = [
  null,
  { cost: rupees(3_500), durationSec: 45, xp: 40 },
  { cost: rupees(9_500), durationSec: 110, xp: 90 },
  { cost: rupees(24_000), durationSec: 210, xp: 180 },
  { cost: rupees(55_000), durationSec: 360, xp: 320 },
  { cost: rupees(1_20_000), durationSec: 540, xp: 520 },
];

export const courseId = (skillId, level) => `${skillId}-l${level}`;

export function parseCourseId(id) {
  if (typeof id !== "string") return null;
  const match = /^([a-z]+)-l([1-5])$/.exec(id);
  if (!match) return null;
  const [, skillId, level] = match;
  if (!SKILLS_BY_ID.has(skillId)) return null;
  return { skillId, level: Number(level) };
}

/** The course that takes `skillId` from `level - 1` to `level`. */
export function courseFor(skillId, level) {
  const skill = SKILLS_BY_ID.get(skillId);
  const tier = TIERS[level];
  if (!skill || !tier) return null;
  return {
    id: courseId(skillId, level),
    skillId,
    skillName: skill.name,
    icon: skill.icon,
    accent: skill.accent,
    level,
    name: `${skill.name} Lv${level}`,
    cost: tier.cost,
    durationSec: tier.durationSec,
    xp: tier.xp,
  };
}

export const COURSE_LEVELS = TIERS.map((tier, level) => (tier ? level : null)).filter(
  (level) => level !== null,
);

/* --- Reading a user's skills ----------------------------------------------
   `skills` is a Mongoose Map on the user document, but these helpers take a
   plain object too so the same maths can run against a lean row or a test
   fixture without caring which it is. */
function rawLevel(skills, skillId) {
  if (!skills) return 0;
  const value = typeof skills.get === "function" ? skills.get(skillId) : skills[skillId];
  const level = Number(value);
  return Number.isFinite(level) ? Math.max(0, Math.min(SKILL_LEVEL_MAX, level)) : 0;
}

export const skillLevel = rawLevel;

export function totalSkillLevels(skills) {
  return SKILLS.reduce((sum, skill) => sum + rawLevel(skills, skill.id), 0);
}

/* --- How skill changes a job ----------------------------------------------
   Two separate effects, and the second is the one that rewards breadth:

     - the level you hold in *this* skill is the big lever (−13% per level);
     - every other level you hold anywhere shaves a little more (−2% each),
       because a designer who can also write does not need a round trip.

   Floored at 30%: a job still has to take some time or the board becomes a
   vending machine. Reward rises the other way, +16% per level, so the two
   curves pull in the same direction — better skills means more money, faster. */
export const MIN_DURATION_FACTOR = 0.3;

export function durationFactor({ level = 0, totalLevels = 0 }) {
  const own = 0.13 * level;
  const others = 0.02 * Math.max(0, totalLevels - level);
  return Math.max(MIN_DURATION_FACTOR, Math.min(1, 1 - own - others));
}

export function rewardFactor(level = 0) {
  return 1 + 0.16 * level;
}

/** Full preview of a job for a given skill state — one source of truth for the
    number on the button and the number the server eventually pays. */
export function projectGig(gig, { level = 0, totalLevels = 0 }) {
  const factor = durationFactor({ level, totalLevels });
  return {
    level,
    durationMs: Math.max(5_000, Math.round(gig.durationSec * factor * 1000)),
    rewardFactorPct: Math.round((rewardFactor(level) - 1) * 100),
    durationSavedPct: Math.round((1 - factor) * 100),
  };
}
