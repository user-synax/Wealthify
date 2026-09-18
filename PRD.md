Virtual Financial Life Simulator — PRD (Compressed)
Status: Planning | Version: 1.0 (condensed) | Currency: INR (virtual only)

1. Vision
A financial life simulator — part banking app, part life sim, part investing game. Users earn, spend, save, invest, and build net worth entirely with fictional money. The hook is high-fidelity interaction: real-feeling transactions (animations, sound, haptics, receipts) over fake data.

2. Core Principles
100% virtual — no real deposits/withdrawals/transfers, ever.
Decisions matter — spending vs. investing should show real consequences over time.
Server-authoritative economy — client never controls balance. Every transaction is validated, atomic, and immutable server-side.
3. Core Loop
Earn → Manage → (Spend | Save) → Invest (Stocks/Property/Business) → Net Worth → Progression
4. Key Systems
Wallet — cash, savings, investments, assets, liabilities, net worth in one dashboard.

Income — salary (career ladder: Intern → Junior → Mid → Senior → Lead → Executive), freelance gigs (reward/difficulty/duration), capped daily tasks/streak rewards.

Expenses — recurring (rent, food, utilities, subscriptions, loan EMIs) + one-time (electronics, travel, repairs).

Store — categorized virtual goods (essentials, tech, transport, lifestyle, luxury); some purchases affect gameplay (e.g., gaming PC → +reward %).

Transactions — every action logged (type, amount, category, balanceBefore/After, metadata, timestamp). Full payment UX: confirm → process → success animation → updated balance, with optional sound/haptics (togglable).

Savings — separate balance, optional interest accrual on a simulated clock. Emergency fund tracker (recommended vs. current, % funded).

Investing (MVP: Stocks) — buy/sell simulated stocks, live-ish price movement, portfolio view with P&L. Post-MVP: index funds, mutual funds, bonds, gold, crypto, real estate, businesses. Market has periodic movement + occasional events (sector shocks) — no guaranteed returns.

Real Estate / Business (Post-MVP) — properties generate rent/appreciation/maintenance; businesses generate daily revenue/expense/profit, upgradeable.

Loans & Credit Score (Post-MVP) — borrow virtual money, EMI schedule, credit score affected by payment history/debt utilization.

Random Life Events (Post-MVP) — occasional balanced surprises (repairs, bonuses, broken phone) — never unfairly punishing.

Budgeting & Analytics — monthly budget vs. actual by category; charts for net worth, income vs. expense, portfolio performance, spending breakdown.

Net Worth (core progression metric)

Net Worth = Cash + Savings + Investments + Property + Business − Debt
Gamification — XP from jobs/streaks/investing/goals; levels (Beginner → Money Manager → Investor → Entrepreneur → Wealth Builder); achievements (first ₹1L, first property, millionaire, comeback, long-term investor, etc.).

Social/Leaderboard (Post-MVP) — optional public profile, opt-in leaderboards across multiple categories (not just net worth), privacy controls.

Simulation Clock — controlled virtual time (e.g., 1 real day ≈ 1 simulated month, tunable), displayed as a simulated date rather than real date.

5. MVP Scope (Must-Have)
Auth: signup, login, logout, profile
Economy: wallet, starting balance, income, expenses, transactions, balance validation
Career: basic jobs, salary, daily tasks
Spending: store, products, purchases, payment confirmation UX
Investing: simulated stocks — buy/sell, portfolio, P&L
Analytics: income/expense/investment tracking, net worth, transaction history
UX: animations, sound, haptics, loading/error states, responsive UI, reduced-motion support
6. Non-Goals for MVP
No real money, real banking, payment gateways, player-to-player transfers, full brokerage simulation, complex tax system, multi-currency, or advanced business sim.

7. Tech Stack
Frontend: Next.js, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion, GSAP
Backend:  Node.js, Express.js
Database: MongoDB
Realtime: WebSocket / Socket.IO / Pusher
Auth:     Session/JWT
Charts:   Recharts (or equivalent)
Project Structure
Monolith repo, frontend and backend kept in separate top-level folders (not microservices, not separate repos):

financial-life-sim/
├── frontend/     (Next.js, TypeScript, Tailwind, shadcn/ui)
└── backend/      (Node.js, Express.js, MongoDB, WebSocket)
8. Core Data Models (condensed)
User: username, email, passwordHash, avatar, level, xp, career
Wallet: userId, cashBalance, savingsBalance, totalEarned, totalSpent, totalInvested
Transaction: userId, type, amount, category, description, balanceBefore, balanceAfter, metadata, createdAt
Investment: userId, assetId, quantity, averageBuyPrice, investedAmount, currentValue
Asset: symbol, name, category, price, volatility, sector
Job: title, reward, difficulty, duration, requirements
Product: name, category, price, effects, rarity
9. Financial Integrity & Anti-Cheat (Critical)
Never trust client-sent balances — server validates and executes every financial op.
Transactions are atomic: verify user → verify product/price → verify balance → create transaction → deduct/credit → commit (rollback on any failure).
Transactions are immutable — corrections happen via new compensating transactions.
Guard against: client-side manipulation, replay attacks, duplicate requests, reward farming, race conditions, negative amounts, float precision issues, automated farming.
Use: server-side validation, idempotency keys, rate limiting, atomic DB ops, audit logs.
Store money as integer minor units (paise) internally; display formatted INR in UI.
10. Build Priority (Sprints)
Landing page, auth, DB, profile, wallet
Transactions, income, expenses, store, payment UX
Career, jobs, salary, daily tasks
Investment engine (assets, portfolio, buy/sell, P&L)
Dashboard, charts, net worth, analytics
Animations, sound, haptics, notifications, security hardening
Achievements, XP/levels, polish, mobile optimization
11. MVP Definition of Done
A user can: sign up → get starting balance → earn money (job/task) → spend in store with real payment feedback → view transaction history → save money → buy and sell a simulated investment → pay recurring expenses → see net worth and totals → unlock achievements → return later and keep playing — all without any real money involved.

12. Post-MVP Roadmap (brief)
v1.1: savings accounts, budgeting, recurring expenses, achievements, XP/levels
v1.2: loans, credit score, random events, more investment types
v1.3: real estate, businesses, passive income, deeper career system
v2: social profiles, leaderboards, friends, challenges
v3: multi-currency, player-run businesses, trading economy, market news
Mantra: Earn it. Spend it. Invest it. Risk it. Build it. — It's your virtual financial life.