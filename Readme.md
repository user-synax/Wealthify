# 💸 Wealthify — Your Virtual Financial Life

<div align="center">

![Wealthify](frontend/public/wealthify.png)

**Earn it. Spend it. Invest it. Risk it. Build it.**

_A high-fidelity financial life simulator with real-feeling money movement — and 100% fictional money._

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Express](https://img.shields.io/badge/Express-4-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-8.x-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![INR Virtual](https://img.shields.io/badge/Money-100%25_virtual_INR-5645d4?style=for-the-badge)](./PRD.md)
[![License](https://img.shields.io/badge/License-MIT-success?style=for-the-badge)](./LICENSE)

[Features](#features) · [How it works](#how-it-works) · [Quickstart](#quickstart) · [Architecture](#architecture) · [API](#api-reference) · [Security](#security)

</div>

---

> ⚠️ **No real money, ever.** Wealthify is a game. No deposits, withdrawals, transfers, or payment gateways. Every rupee is simulated, every balance is server-authoritative, every transaction is immutable.

## ✨ What is this?

Wealthify is **part banking app, part life sim, part investing game**. You sign up, get **₹25,000 in virtual starting cash**, pick a career, grind freelance gigs, level skills, pay rent, buy a mechanical keyboard that makes you earn faster, set a payment PIN, and watch your **net worth** become the scoreboard.

The hook isn't fake data — it's **high-fidelity interaction**: confirm → process → success animation → receipt → updated balance, with optional sound + haptics, real timers, late fees, autopay failures, and promotions that land like real payslips.


## 🎮 Features

### 💼 Wallet & net worth
Single source of truth at `GET /api/wallet`. Cash + savings with instant
transfers between them, lifetime earned / spent / invested totals, and:

```
Net Worth = Cash + Savings + Investments − Debt
```

Opening the dashboard **advances the simulated clock** — salary lands,
autopay runs, and toast notices explain what just happened.

### 📈 Career ladder
Six rungs, walked in order, unlocked by lifetime XP — never bought:

| Tier | Salary / sim-month | XP gate |
|---|---|---|
| Intern | ₹18,000 | 0 |
| Junior | ₹34,000 | 400 |
| Mid | ₹58,000 | 1,200 |
| Senior | ₹92,000 | 2,600 |
| Lead | ₹1,45,000 | 5,200 |
| Executive | ₹2,40,000 | 9,000 |

Promotions are automatic on the next economy sync — a ledger entry plus a
toast, the way a real payslip upgrade lands.

### 🛠️ Freelance gigs (real timers, not buttons)
Starting a gig opens a **real countdown**. Money sits in client escrow until
the timer finishes and you **transfer it out**. 3 engagement slots, 60 gigs
per cycle cap.

- **6 skills** — Logistics, Writing, Design, Marketing, Video & Photo,
  Programming (Lv0–Lv5)
- **Skill-gated board** — higher gigs need higher levels; courses cost money
  *and* take real time
- **Skill maths** — own level cuts duration −13%/level, breadth −2%/level
  (floor 30%); reward rises +16%/level
- **Deterministic variance** — ±10% payout hashed from `(gig, count)`, so
  retries can't reroll luck

### ✅ Daily tasks & streaks
Three capped tasks per **real** day (review budget, market watch, log
spending). Streak bonus **+8%/day up to +40%**. Counted on real days so the
simulated clock can't reset it.

### 🏪 Store with consequences
~24 products across Essentials, Food & home, Tech, Transport, Lifestyle and
Luxury — Common → Rare → Epic → Legendary. Purchases change gameplay:

- 🎁 **Gear boosts income** — e.g. camera kit +8% gig rewards (capped +40%)
- 🧾 **Upkeep creates bills** — buy a car, inherit a ₹22,000/cycle upkeep
  bill starting next month

XP per purchase scales with rarity (10 → 25 → 60 → 150).

### 🧾 Recurring bills & autopay
Starter templates (rent ₹14,000, groceries ₹7,500, electricity, broadband,
streaming, student-loan EMI) plus purchase-unlocked upkeep. Due-ness is
computed from the **cycle counter**, never wall-clock dates — a closed laptop
can't skip a bill, it accumulates as arrears.

- **Late fee 4%**, capped at 3 overdue cycles (recoverable, no debt spiral)
- Arrears settle **all at once**, like a real landlord — plus one late fee
- **Autopay** per bill; one bounced subscription never blocks the others,
  and failures arrive as explicit notices with the shortfall

### 🔐 Payment UX (the signature)
Every payment flows through a bottom-sheet checkout:

```
method → PIN → confirm → process → success animation → receipt
```

- 4-digit **bcrypt-hashed PIN** (`1234` / `0000` rejected at set time)
- 5 wrong attempts → **10-minute lockout** with visible retry timer
- Simulated **Balance / UPI / Card** methods, references like `WFL-XXXX-XXXXXX`
- Itemized **receipts** re-openable days later (balance shown is *at time
  of payment*, not now)
- Sound + haptics, togglable, `prefers-reduced-motion` respected

### 🏆 Social & progression
Leaderboard ranked by net worth (`/leaderboard`), public profiles
(`/profile/[username]`) with avatar / bio / level / career / streak, and XP
levels (500 XP = 1 level).

### 📱 PWA + motion
Installable (`standalone`, navy splash, maskable icons). The service worker
caches static assets but **never `/api/*` and never HTML** — a cached balance
is worse than no balance. Landing page runs scroll-reveal + an animated demo
wallet card; the app shell uses a sidebar on desktop and a bottom tab bar on
mobile.

### 🔜 Coming soon
Simulated stock market with portfolio + P&L, and savings goals /
emergency-fund tracker — already stubbed in the dashboard and landing page.

## 🕰️ How it works

### The simulated clock
**1 real day = 1 simulated month.** The economy keys on an integer `cycle`
(months since signup), not calendar dates. Salary credits and bills roll over
when the cycle increments. Catch-up is capped at **3 cycles** — time away
isn't a money printer. Dev override: `SIM_MONTH_MS` (e.g. 10 min = an

## 🏗️ Architecture

Monorepo — separate apps, one repo (per PRD):

```
Wealthify/
├── README.md            ← you are here
├── PRD.md               ← product spec (compressed)
├── DESIGN.md            ← Notion-inspired design system
├── backend/             ← Node.js + Express + MongoDB
│   └── src/
│       ├── index.js     ← wiring, rate limits, error contract
│       ├── config.js    ← env, paise constants, sim-clock tuning
│       ├── db.js        ← mongoose connect
│       ├── data/        ← PRICE AUTHORITY (catalog, income, expenses, skills)
│       ├── models/      ← User, Wallet, Transaction, Bill, Engagement, Inventory
│       ├── services/    ← ledger, economy, clock, bills, payments, receipts
│       ├── routes/      ← auth, wallet, store, income, expenses,
│       │                  payments, transactions, social
│       ├── middleware/  ← auth (JWT cookie), origin-guard (CSRF layer)
│       └── utils/       ← jwt, http-error, serialize
└── frontend/            ← Next.js 16 + React 19 + Tailwind v4 + Motion
    ├── app/             ← landing, dashboard, income, expenses, store,
    │                      activity, leaderboard, profile, login, signup, offline
    ├── components/      ← dashboard-shell, checkout-sheet, receipt-modal,
    │                      pin-pad, auth-provider, payment-feedback, toasts…
    ├── lib/             ← api (fetch + INR formatters + idempotency keys),
    │                      economy, social, auth helpers
    ├── public/          ← PWA icons, service worker
    └── proxy.js         ← route guard (authorization stays server-side)
```

### Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16, React 19, Tailwind CSS v4, Motion, Phosphor icons, Geist |
| Backend | Node.js (ESM), Express 4, Mongoose 8, JWT in `httpOnly` cookies |
| Database | MongoDB — single-node friendly (no multi-doc transactions needed) |
| Hardening | Helmet, single-origin CORS, `express-rate-limit`, origin guard |
| PWA | Web manifest, maskable icons, narrow service worker, iOS meta |
| Package mgr | `bun` (frontend) / `npm` (backend) |

### Data flow: a purchase

```
UI (sku + PIN + idempotencyKey)
 → POST /api/store/purchase
 → origin-guard → requireAuth → purchaseLimiter (30/min)
 → syncEconomy (advance clock: salary → promotion → autopay)
 → catalog lookup by sku (price from server, never body)
 → verifyPin (bcrypt + lockout)
 → ledger.postEntry:
     1. insert pending txn (unique on userId + idempotencyKey)

## 🚀 Quickstart

### Prerequisites
- **Node.js 18+** (backend `node --watch`, frontend Next 16)
- **MongoDB** running locally (or a connection string) — default
  `mongodb://127.0.0.1:27017/wealthify`
- **bun** (frontend lockfile is `bun.lock`) — npm works too

### 1. Backend

```bash
cd backend
cp .env.example .env   # then set JWT_SECRET (min 32 random chars)
npm install
npm run dev            # → http://localhost:4000
```

`GET /api/health` should return `{ "ok": true }`.

### 2. Frontend

```bash
cd frontend
bun install            # or: npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:4000" > .env.local
bun run dev            # or: npm run dev → http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000), sign up, set a payment
PIN on first checkout, and the dashboard syncs the economy on load.

### Environment

**`backend/.env`:**

| Var | Default | Notes |
|---|---|---|
| `PORT` | `4000` | API port |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/wealthify` | Required |
| `JWT_SECRET` | — | **Required, ≥32 chars.** App refuses to boot without it |
| `JWT_EXPIRES_IN` | `7d` | Session lifetime (httpOnly cookie) |
| `FRONTEND_URL` | `http://localhost:3000` | Sole CORS origin |
| `NODE_ENV` | `development` | `production` hides error internals |
| `SIM_MONTH_MS` | `86400000` | 1 day = 1 month. Set `600000` for a 10-min dev loop |
| `TRUST_PROXY` | `0` | Hops in front of the app (rate-limit correctness) |

**`frontend/.env.local`:**

| Var | Example | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Backend base URL |

## 📡 API reference

Base `http://localhost:4000`. Auth = `httpOnly` cookie (`wealthify_token`);
client sends `credentials: "include"` and never sees the token.

| Method & path | What it does |
|---|---|
| `POST /api/auth/signup` | Create account → wallet (₹25,000) + signup-bonus entry |
| `POST /api/auth/login` | Login with email *or* username (constant-time miss path) |
| `POST /api/auth/logout` | Clear session cookie |
| `GET /api/auth/me` | Session snapshot (user + wallet + clock) |
| `PATCH /api/auth/profile` | Edit bio / avatar (allow-listed emoji) |
| `GET /api/wallet` | Dashboard truth: wallet + clock + notices + due-bill summary |
| `POST /api/wallet/transfer` | Move cash ↔ savings (`deposit` / `withdraw`, paise) |
| `GET /api/store` | Catalog with server-computed affordability + reward bonus |
| `POST /api/store/purchase` | Full order pipeline (PIN + idempotent + receipt) |
| `GET /api/income` | Gig board + skills + tasks + career in one call |
| `POST /api/income/gigs/:id/start` | Open a timed engagement (slot-gated) |
| `POST /api/income/engagements/:id/transfer` | Move finished escrow → wallet |
| `POST /api/income/courses/:id/enroll` | Pay for a skill course (PIN + idempotent) |
| `POST /api/income/engagements/:id/collect` | Claim a finished course level |
| `POST /api/income/tasks/:id/complete` | Claim a daily task (streak-adjusted) |
| `GET /api/expenses` | All bills with due-ness resolved + category summary |
| `POST /api/expenses/bills/:id/pay` | Settle all unpaid cycles + late fee in one payment |

## 🛡️ Financial integrity & security

The parts that make this more than a CRUD demo (PRD §9):

- **Never trust the client** — prices, rewards, durations, due-ness and
  affordability are recomputed server-side on every call
- **Atomic ledger** — funds check lives in the MongoDB filter, not in a
  prior JS read; concurrent racers get exactly one winner
- **Idempotency everywhere** — unique partial index on
  `(userId, idempotencyKey)`; replays return the original row
- **Immutable history** — only `pending → completed/failed` transitions;
  corrections are compensating entries
- **Anti-farm caps** — gig slots, per-cycle job cap, per-day task cap,
  catch-up salary cap, reward-bonus cap (40%), streak cap (40%)
- **PIN security** — bcrypt rest, per-account attempt counter + IP limiter,
  weak-PIN rejection, visible lockout (no silent failures)
- **Auth hygiene** — bcrypt-12 passwords, timing-equalised login misses,
  generic credential errors (no enumeration), short/forge-proof JWT guard
- **Transport** — Helmet, 100kb JSON cap, single-origin CORS + credentials,
  second CSRF origin layer, `CastError` → 404 (no ID oracle)

## 🎨 Design system

Source of truth: [`DESIGN.md`](./DESIGN.md) + [`taste-SKILL.md`](./taste-SKILL.md).

- Light canvas (`#ffffff` / `#f6f5f4`), navy hero bands (`#0a1530`),
  primary purple `#5645d4`, full pastel card-tint set
- Geist Sans + Mono, 8px buttons / 12px cards, hairline borders, soft motion
  tokens (`--duration-*`, `--ease-*`), skeleton → blur-reveal loading,
  badge / toast / toggle micro-motion, reduced-motion fallbacks
- Income copy reads as trade-offs (“costs money *and* takes real time”);
  every comment block names *why*, not just *what*

## 🗺️ Roadmap

From [`PRD.md`](./PRD.md) — MVP is auth → wallet → income → store → bills →
receipts → leaderboard (this repo). Next:

- **v1.1** — savings goals, budgeting, achievements, XP polish
- **v1.2** — loans + credit score, random life events, more asset classes
- **v1.3** — real estate, businesses, passive income, deeper careers
- **v2** — friends, challenges, richer social
- **v3** — multi-currency, player-run businesses, market news

Markets + savings goals are already stubbed as “Coming soon” in the UI.

## 🤝 Contributing

```bash
git clone https://github.com/user-synax/Wealthify.git
cd Wealthify
# backend + frontend quickstart above, then:
git checkout -b feat/my-change
# …edit, keep paise-integers + idempotency keys on money routes…
```

- Money stays integer paise; formatting lives in `frontend/lib/api.js`
- New products/gigs/skills go in `backend/src/data/` (server authority)
- Every money route needs an idempotency key + a receipt response
- Keep comments in the house style: the *reason* a rule exists

## 📄 License

MIT — do whatever you want, just don't run it with real money. 🙂
Built from [`PRD.md`](./PRD.md). Virtual INR only, forever.

---

<div align="center">

**Wealthify** — _Earn it. Spend it. Invest it. Risk it. Build it._

Your virtual financial life, simulated beautifully.

</div>

| `PATCH /api/expenses/bills/:id` | Toggle `autopay` |
| `GET /api/payments/methods` | Checkout methods + `hasPin` |
| `POST /api/payments/pin` | Create / change PIN (current PIN needed to change) |
| `GET /api/payments/status` | Minimal checkout pre-check (`hasPin`, lock state) |
| `GET /api/transactions` | Activity feed — cursor paging, filters, search |
| `GET /api/transactions/:id` | Full receipt for one entry |
| `GET /api/social/leaderboard` | Top accounts by net worth |
| `GET /api/social/profiles/:username` | Public profile card |

All money-moving routes require `idempotencyKey` (`[\w:-]{8,120}`).
Failures share one contract: `{ error: { code, message?, fields?, details? } }`
— clients branch on `code` (`INSUFFICIENT_FUNDS`, `PIN_LOCKED`,
`BILL_NOT_DUE`, `TASK_CAP_REACHED`, `RATE_LIMITED`…), never on copy.

     2. conditional $inc (funds check IN the filter)
     3. mark completed with balanceBefore / After
 → inventory upsert + upkeep bill + XP
 → 201 { receipt } → success animation → toast → balance update
```

Replay the same key → original receipt back, `replay: true`, zero side
effects.

observable payday-to-payday loop).

### The core loop
1. **Sign up** → ₹25,000 starting cash + immutable signup-bonus ledger entry
2. **Work** → start gigs (timers run in real seconds) → transfer escrow →
   salary auto-credits each cycle
3. **Level** → spend course money + wait real time → unlock higher-paying gigs
4. **Spend** → store purchases with PIN + receipt; gear boosts future income
5. **Survive** → pay bills on time (14 XP) or eat late fees (6 XP); autopay
6. **Build** → net worth climbs → career promotes → leaderboard rank rises


```
Earn → Manage → (Spend | Save) → Invest → Net Worth → Level Up
                                           ↻ 1 real day = 1 simulated month
```

### Why it feels real

| Principle | How it's enforced |
|---|---|
| 🖥️ **Server-authoritative economy** | Client sends `sku` / `id`, never a price. Catalogs live in `backend/src/data/`. |
| 🧾 **Immutable ledger** | Corrections are new compensating transactions. Rows go `pending → completed/failed`, never edited. |
| ⚛️ **Atomic money moves** | Single conditional `$inc` in MongoDB — two concurrent payments can't both read the same balance and pass. |
| 🔁 **Idempotent everything** | Every money route takes an `idempotencyKey`. Retry the same payment, get the original receipt back — never a double charge. |
| 💰 **Integer paise everywhere** | No floats for money. `₹18,000` crosses the wire as `1800000`. Formatting happens once in `frontend/lib/api.js`. |

</div>
