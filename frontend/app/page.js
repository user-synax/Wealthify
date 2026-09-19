"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  Bank,
  CaretDown,
  ChartLineUp,
  GraduationCap,
  List,
  LockKey,
  Receipt,
  SpeakerHigh,
  Storefront,
  Timer,
  Wallet,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useAuth } from "../components/auth-provider";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Markets", href: "#markets" },
  { label: "FAQ", href: "#faq" },
];

const MENU_ID = "primary-menu";

/* A duration token reads back as "150ms" untransformed but ".15s" once the CSS
   is minified, so parse the unit instead of assuming milliseconds. Reading it
   keeps the JS cleanup in sync with --dropdown-close-dur. */
function durationMs(value, fallback) {
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return value.trim().endsWith("ms") ? parsed : parsed * 1000;
}

/* Scripted frames for the hero's live wallet card. Cash, savings and invested
   are the inputs and net worth is always their sum, so the headline figure can
   never disagree with the breakdown under it. Sample data, labelled as such. */
const DEMO_FRAMES = [
  {
    cash: 41320,
    savings: 96000,
    invested: 147330,
    activity: "Salary credited +₹48,000",
  },
  {
    cash: 24820,
    savings: 96000,
    invested: 147330,
    activity: "Rent paid -₹16,500",
  },
  {
    cash: 24820,
    savings: 96000,
    invested: 148670,
    activity: "Market moved +₹1,340",
  },
  {
    cash: 21580,
    savings: 96000,
    invested: 148670,
    activity: "Grocery run -₹3,240",
  },
  {
    cash: 22310,
    savings: 96000,
    invested: 148670,
    activity: "Dividend paid +₹730",
  },
];

const FRAME_INTERVAL = 3400;

const STAT_ROWS = [
  { key: "cash", label: "Cash" },
  { key: "savings", label: "Savings" },
  { key: "invested", label: "Invested" },
];

const inr = new Intl.NumberFormat("en-IN");

/* Resolved once at module scope rather than during render: reading the clock in
   a component body is impure, and the footer year does not need to be
   re-derived on every keystroke of state. */
const CURRENT_YEAR = new Date().getFullYear();

/* --- Page content ---------------------------------------------------------
   Everything here is a description of something the app actually does. No
   feature is listed that does not exist in the codebase, and the one that
   doesn't yet — the market — says so. */

const FEATURES = [
  {
    icon: Wallet,
    tint: "bg-tint-sky",
    title: "One wallet, one score",
    body: "Cash, savings and net worth in a single view, with instant transfers between them. Net worth only ever moves because a ledger entry moved it.",
  },
  {
    icon: Bank,
    tint: "bg-tint-mint",
    title: "Income that isn't a button",
    body: "Start as an Intern and work the career ladder to Executive. Salary credits itself when the simulated month turns over — there is no claim button to forget.",
  },
  {
    icon: GraduationCap,
    tint: "bg-tint-lavender",
    title: "Skills change the work",
    body: "Six skills, five levels each, bought with money and paid for in waiting. Every level raises the fee and shortens the job — and levels held anywhere make everything else faster.",
  },
  {
    icon: Timer,
    tint: "bg-tint-peach",
    title: "Freelance work, then transfer",
    body: "Take a job, let the timer run, and the fee lands in escrow. It reaches your wallet only when you transfer it — which is the whole point of taking it.",
  },
  {
    icon: Storefront,
    tint: "bg-tint-yellow",
    title: "A store with consequences",
    body: "Buy the gear that raises what your work pays. Then keep paying for it: some purchases add a monthly bill you will meet again.",
  },
  {
    icon: Receipt,
    tint: "bg-tint-rose",
    title: "Receipts you can reopen",
    body: "Every movement is immutable, with its own reference, method and the balance it produced. Nothing is edited after the fact — corrections are new entries.",
  },
];

/* The payment flow, step for step. Rendered as a real timeline rather than a
   screenshot, because the sequence is the feature. */
const UPI_STEPS = [
  "Opening your UPI app",
  "Verifying the merchant",
  "Raising the collect request",
  "Approving with your UPI PIN",
  "Request sent to your bank",
  "Waiting for your approval",
  "Authorising the debit",
  "Debiting your account",
  "Confirming with the merchant",
  "Generating the payment reference",
];

const PAYMENT_NOTES = [
  {
    icon: LockKey,
    title: "A PIN, not a checkbox",
    body: "Four digits, hashed at rest, required for every payment. Five wrong tries locks payments for ten minutes.",
  },
  {
    icon: SpeakerHigh,
    title: "Sound and haptics",
    body: "Synthesised on your device, not downloaded — a click for each key, a chime when money lands. Both toggleable.",
  },
  {
    icon: WarningCircle,
    title: "It can say no",
    body: "Payments get declined. Insufficient funds shows exactly what you had, what was needed and how far short you were.",
  },
];

const STEPS = [
  {
    title: "Create an account",
    body: "You start with ₹25,000 of virtual money. No card, no deposit, no bank details — nothing here touches real accounts.",
  },
  {
    title: "Earn it",
    body: "Take a salary on the career ladder, learn skills to unlock better-paid work, and claim small daily tasks to keep a streak alive.",
  },
  {
    title: "Spend and save it",
    body: "Groceries, rent, a laptop, a car. Some purchases raise what your work pays, and some of them come with a bill you keep meeting.",
  },
  {
    title: "Watch the number",
    body: "Net worth is cash plus savings plus investments. Decisions you make in week one are visible in it a month later.",
  },
];

const MARKET_PREVIEW = [
  {
    icon: ChartLineUp,
    title: "Simulated stocks",
    body: "Prices that move on their own, with no guaranteed returns.",
  },
  {
    icon: Wallet,
    title: "A real portfolio",
    body: "Positions, average buy price, and profit or loss that updates.",
  },
  {
    icon: WarningCircle,
    title: "Sector events",
    body: "Occasional shocks that move a whole category at once.",
  },
];

const FAQ = [
  {
    q: "Is any of this real money?",
    a: "No. Wealthify is a simulator. There are no deposits, no withdrawals, no payment gateway and no bank connection anywhere in it. Every rupee is fictional and every balance lives in our database.",
  },
  {
    q: "Do I need to enter card or bank details?",
    a: "Never. The UPI, card and balance options at checkout are simulated end to end — they settle against your virtual balance. The only secret the app holds is your 4-digit payment PIN, which is hashed and never shown back to you.",
  },
  {
    q: "How fast does time move?",
    a: "One real day is one simulated month. Salary, bills and interest all run on that clock, so a payday-to-payday cycle takes about a day of real time to pass.",
  },
  {
    q: "Why do I have to wait for freelance work?",
    a: "Because a job you tap and instantly get paid for is a slot machine. Real work takes time and then it takes a claim: the fee sits in escrow until you transfer it into your wallet.",
  },
  {
    q: "What happens if I run out of money?",
    a: "Bills still come due. Unpaid bills accrue a late fee, and autopay will collect them the moment a new month credits your salary. You can always work more, learn a skill or sell something.",
  },
  {
    q: "Can I lose my progress?",
    a: "Your balance, skills, jobs and history all live server-side, so closing the tab costs you nothing. Signing out and back in picks up exactly where you left off.",
  },
];

/* --- Local presentation helpers ------------------------------------------ */

/* Scroll reveal.

   `initial={false}` is the important part. A hidden initial state would be
   server-rendered, so the page's own content would ship to the browser
   invisible and stay that way until JavaScript ran — bad for a slow phone, and
   bad for anything reading the page without running scripts. Leaving `initial`
   alone means the markup is visible by default and the reveal is a pure
   enhancement applied when the element scrolls into view. */
function Reveal({ children, className, delay = 0 }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <div className={className}>{children}</div>;

  return (
    <m.div
      className={className}
      initial={false}
      whileInView={{ opacity: [0, 1], y: [16, 0] }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </m.div>
  );
}

function SectionHeading({ eyebrow, title, body }) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-stone">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-balance text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink sm:text-[40px]">
        {title}
      </h2>
      {body && (
        <p className="mx-auto mt-4 max-w-[56ch] text-[16px] leading-[1.6] text-steel">
          {body}
        </p>
      )}
    </Reveal>
  );
}

/* motions.dev does the height here rather than CSS: an accordion panel's
   height is a value that has to be measured and animated, and `height: auto`
   is the one thing a CSS transition cannot interpolate. */
function FaqItem({ item, open, onToggle }) {
  const id = useId();
  const reduceMotion = useReducedMotion();

  return (
    <div className="border-b border-hairline last:border-b-0">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={onToggle}
          className="focus-ring flex w-full items-center justify-between gap-4 rounded-lg py-4 text-left"
        >
          <span className="text-[16px] font-medium text-charcoal">{item.q}</span>
          <CaretDown
            size={18}
            weight="bold"
            aria-hidden="true"
            className={`shrink-0 text-steel transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      </h3>

      <AnimatePresence initial={false}>
        {open && (
          <m.div
            key="panel"
            id={`${id}-panel`}
            initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <p className="pb-5 pr-8 text-[15px] leading-[1.65] text-steel">{item.a}</p>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Home() {
  const [entered, setEntered] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const [heroIn, setHeroIn] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);

  const sentinelRef = useRef(null);
  const panelRef = useRef(null);
  const toggleRef = useRef(null);
  const closeTimer = useRef(null);
  const digitsRef = useRef(null);
  const swapRef = useRef(null);
  const firstSwapSkipped = useRef(false);

  const frame = DEMO_FRAMES[frameIndex];
  /* Net worth is derived, never stored, so the headline figure stays equal to
     the three balances printed beneath it. */
  const netWorthText = inr.format(frame.cash + frame.savings + frame.invested);

  /* Entrance: transitions-dev #18 (texts reveal). The flag flips one tick
     after paint so the staggered rise actually plays instead of collapsing
     into the first render. A timeout rather than requestAnimationFrame: rAF
     is suspended in a backgrounded tab or a non-composited webview, which
     would leave the pill empty until the user touched the page. */
  useEffect(() => {
    const timer = setTimeout(() => setEntered(true), 20);
    return () => clearTimeout(timer);
  }, []);

  /* Scrolled state from an IntersectionObserver on a sentinel. A scroll
     listener is explicitly out of bounds (taste-skill 5.D): it would fire on
     every frame and re-render the tree continuously. */
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(([entry]) => {
      setScrolled(!entry.isIntersecting);
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const openMenu = useCallback(() => {
    clearTimeout(closeTimer.current);
    setMenuClosing(false);
    setMenuOpen(true);
  }, []);

  /* transitions-dev #05 (menu dropdown). Close is two-phase: `.is-closing`
     owns the scale-down, then it is removed after --dropdown-close-dur so the
     next open starts from the resting pre-open scale instead of jumping. */
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setMenuClosing(true);

    const closeMs = durationMs(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--dropdown-close-dur",
      ),
      150,
    );

    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setMenuClosing(false), closeMs);
  }, []);

  const { status, logout } = useAuth();
  const router = useRouter();

  /* One accordion open at a time, and one already open on arrival so the
     section never reads as a wall of closed bars. */
  const [openFaq, setOpenFaq] = useState(0);

  /* The middleware already redirects a signed-in visitor before any HTML is
     sent. This is the client half of the same rule, and it exists because the
     cookie is only a routing hint: if it was present at the edge but the API
     rejects it, AuthProvider says so and this correctly does nothing. */
  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);

  const onLogout = useCallback(async () => {
    await logout();
    closeMenu();
  }, [logout, closeMenu]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  /* Dismiss the mobile panel on Escape or a click outside of it. */
  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event) => {
      if (event.key === "Escape") closeMenu();
    };
    const onPointerDown = (event) => {
      if (panelRef.current?.contains(event.target)) return;
      if (toggleRef.current?.contains(event.target)) return;
      closeMenu();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen, closeMenu]);

  /* Hero copy rides in just behind the navbar so the page reveals in sequence
     rather than landing all at once. */
  useEffect(() => {
    const timer = setTimeout(() => setHeroIn(true), 160);
    return () => clearTimeout(timer);
  }, []);

  /* Steps the scripted demo. Ticks are skipped while the tab is hidden, and
     for visitors who asked for reduced motion the figures simply hold still. */
  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timer = setInterval(() => {
      if (reduceMotion.matches || document.visibilityState !== "visible") return;
      setFrameIndex((index) => (index + 1) % DEMO_FRAMES.length);
    }, FRAME_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  /* transitions-dev #02 replay. The new digits are already committed by the time
     this runs, so dropping the class, forcing a reflow and re-adding it is what
     makes them animate in again rather than swapping silently. */
  useEffect(() => {
    const group = digitsRef.current;
    if (!group) return;
    group.classList.remove("is-animating");
    void group.offsetHeight;
    group.classList.add("is-animating");
  }, [netWorthText]);

  /* transitions-dev #04 replay, skipping the first run because the span already
     renders frame zero. */
  useEffect(() => {
    const label = swapRef.current;
    if (!label) return;
    if (!firstSwapSkipped.current) {
      firstSwapSkipped.current = true;
      return;
    }

    const swapMs = durationMs(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--text-swap-dur",
      ),
      150,
    );

    label.classList.add("is-exit");
    const timer = setTimeout(() => {
      label.textContent = DEMO_FRAMES[frameIndex].activity;
      label.classList.remove("is-exit");
      label.classList.add("is-enter-start");
      void label.offsetHeight;
      label.classList.remove("is-enter-start");
    }, swapMs);

    return () => clearTimeout(timer);
  }, [frameIndex]);

  return (
    <>
      {/* Scroll sentinel. It sits at the very top of the document, so the pill
          can react to "has the page moved" without listening to scroll. */}
      <span
        ref={sentinelRef}
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px"
      />

      <header
        className={`nav-float pointer-events-none fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6 sm:pt-5 ${
          scrolled ? "is-scrolled" : ""
        }`}
      >
        <div className="relative mx-auto w-full max-w-6xl">
          {/* The pill. Blurred glass over whatever scrolls beneath it. */}
          <div className="nav-pill pointer-events-auto rounded-full p-1.5 sm:p-2">
            <div
              className={`t-stagger flex items-center justify-between gap-2 ${
                entered ? "is-shown" : ""
              }`}
            >
              {/* Brand */}
              <a
                href="#top"
                className="t-stagger-line t-stagger-line--1 focus-ring flex shrink-0 items-center gap-2.5 rounded-full py-1 pl-1 pr-3"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-navy">
                  <Image
                    src="/wealthify-mark.png"
                    alt=""
                    width={114}
                    height={144}
                    fetchPriority="high"
                    className="h-[22px] w-auto"
                  />
                </span>
                <span className="text-[17px] font-semibold tracking-[-0.02em] text-charcoal">
                  Wealthify
                </span>
              </a>

              {/* Desktop links */}
              <nav
                aria-label="Primary"
                className="t-stagger-line t-stagger-line--2 hidden items-center gap-1 lg:flex"
              >
                {NAV_LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="nav-item focus-ring rounded-full px-3.5 py-2 text-sm font-medium"
                  >
                    {link.label}
                  </a>
                ))}
              </nav>

              {/* Actions */}
              <div className="t-stagger-line t-stagger-line--3 flex items-center gap-1.5 sm:gap-2">
                {status === "authenticated" ? (
                  <>
                    <button
                      type="button"
                      onClick={onLogout}
                      className="btn-ghost focus-ring hidden rounded-lg px-4 py-2.5 text-sm font-medium sm:inline-flex"
                    >
                      Log out
                    </button>
                    <a
                      href="/dashboard"
                      className="btn-primary focus-ring inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-medium"
                    >
                      Open dashboard
                    </a>
                  </>
                ) : (
                  <>
                    <a
                      href="/login"
                      className="btn-ghost focus-ring hidden rounded-lg px-4 py-2.5 text-sm font-medium sm:inline-flex"
                    >
                      Log in
                    </a>
                    <a
                      href="/signup"
                      className="btn-primary focus-ring inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-medium"
                    >
                      Get started
                    </a>
                  </>
                )}

                <button
                  ref={toggleRef}
                  type="button"
                  aria-label={menuOpen ? "Close menu" : "Open menu"}
                  aria-expanded={menuOpen}
                  aria-controls={MENU_ID}
                  onClick={menuOpen ? closeMenu : openMenu}
                  className="nav-item focus-ring grid h-10 w-10 place-items-center rounded-lg lg:hidden"
                >
                  <span
                    aria-hidden="true"
                    className="t-icon-swap"
                    data-state={menuOpen ? "b" : "a"}
                  >
                    <span className="t-icon" data-icon="a">
                      <List size={20} weight="bold" />
                    </span>
                    <span className="t-icon" data-icon="b">
                      <X size={20} weight="bold" />
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Mobile panel: transitions-dev #05, growing from the trigger side.
              `inert` while closed, because a panel that is only faded out would
              otherwise stay in the tab order and the accessibility tree. */}
          <div
            id={MENU_ID}
            ref={panelRef}
            data-origin="top-right"
            inert={!menuOpen}
            className={`nav-panel t-dropdown absolute inset-x-0 top-[calc(100%+10px)] rounded-2xl p-2 lg:hidden ${
              menuOpen ? "is-open" : ""
            } ${menuClosing ? "is-closing" : ""}`}
          >
            <nav aria-label="Mobile" className="grid gap-0.5">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={closeMenu}
                  className="nav-item focus-ring rounded-xl px-3.5 py-3 text-[15px] font-medium"
                >
                  {link.label}
                </a>
              ))}
            </nav>

            <div className="mt-2 grid gap-2 border-t border-hairline p-2 pt-3">
              {status === "authenticated" ? (
                <>
                  <a
                    href="/dashboard"
                    onClick={closeMenu}
                    className="btn-primary focus-ring rounded-lg px-4 py-2.5 text-center text-sm font-medium"
                  >
                    Open dashboard
                  </a>
                  <button
                    type="button"
                    onClick={onLogout}
                    className="btn-ghost focus-ring rounded-lg px-4 py-2.5 text-center text-sm font-medium"
                  >
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <a
                    href="/login"
                    onClick={closeMenu}
                    className="btn-ghost focus-ring rounded-lg px-4 py-2.5 text-center text-sm font-medium"
                  >
                    Log in
                  </a>
                  <a
                    href="/signup"
                    onClick={closeMenu}
                    className="btn-primary focus-ring rounded-lg px-4 py-2.5 text-center text-sm font-medium"
                  >
                    Get started
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero band: DESIGN.md's navy hero with centered display copy and the
            design system's pastel dots. The product appears below it as a real,
            live card rather than a mock screenshot. Deliberately no `isolate`
            here: that would make the band a stacking context which paints over
            the card pulled up into it, so the following section is the
            positioned one and wins the overlap instead. */}
        <section className="relative overflow-hidden bg-navy px-6 pb-40 pt-32 text-center text-on-dark sm:pb-48 sm:pt-40 lg:pb-56 lg:pt-48">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-[8%] top-[22%] h-3.5 w-3.5 rounded-full bg-[var(--brand-pink)]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-[8%] top-[17%] h-2.5 w-2.5 rounded-full bg-[var(--brand-yellow)]"
          />
          {/* The inner four only appear once the viewport is wider than the
              text block, otherwise they would sit on top of the copy. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-[19%] top-[42%] hidden h-2 w-2 rounded-full bg-[var(--brand-teal)] xl:block"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-[16%] top-[44%] hidden h-3 w-3 rounded-full bg-[var(--brand-orange)] xl:block"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-[30%] top-[12%] hidden h-1.5 w-1.5 rounded-full bg-[var(--brand-purple)] xl:block"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-[18%] top-[30%] hidden h-2 w-2 rounded-full bg-[var(--tint-sky)] xl:block"
          />

          <div className="relative mx-auto max-w-4xl">
            <div className={`t-stagger ${heroIn ? "is-shown" : ""}`}>
              <h1 className="t-stagger-line t-stagger-line--1 text-balance text-[40px] font-semibold leading-[1.05] tracking-[-0.025em] sm:text-[56px] lg:text-[72px] xl:text-[80px]">
                Earn it. Spend it. Invest it. Build it.
              </h1>
              <p className="t-stagger-line t-stagger-line--2 mx-auto mt-6 max-w-[52ch] text-lg leading-[1.5] text-on-dark-muted">
                Part banking app, part life sim, part investing game. Earn a
                salary, run a household, and invest in a market that moves on
                its own.
              </p>
              <div className="t-stagger-line t-stagger-line--3 mt-9 flex flex-wrap items-center justify-center gap-3">
                <a
                  href="/signup"
                  className="btn-on-dark focus-ring inline-flex rounded-lg px-5 py-3 text-sm font-medium"
                >
                  Create your free account
                </a>
                <a
                  href="#features"
                  className="btn-outline-dark focus-ring inline-flex rounded-lg px-5 py-3 text-sm font-medium"
                >
                  See how it works
                </a>
              </div>
              <p className="t-stagger-line t-stagger-line--4 mt-6 text-sm text-on-dark-muted">
                Virtual money only. No deposits, no bank details, no real risk.
              </p>
            </div>
          </div>
        </section>

        {/* The wallet card breaks out of the band edge on DESIGN.md's
            elevation-3 shadow. It is a working component, not a mock: the
            figures step through a scripted demo and each digit re-enters on
            transitions-dev's number pop-in. */}
        <section className="relative flow-root bg-canvas px-6">
          <div className="mx-auto -mt-24 max-w-4xl sm:-mt-32 lg:-mt-36">
            <div className="rounded-xl border border-hairline bg-canvas p-5 shadow-[rgba(15,15,15,0.2)_0px_24px_48px_-8px] sm:p-8">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                <h2 className="text-sm font-medium text-steel">Net worth</h2>
                <span className="rounded-full bg-tint-mint px-2.5 py-1 text-[13px] font-semibold text-success">
                  +2.4% this month
                </span>
              </div>

              <p className="mt-3 text-[36px] font-semibold leading-none tracking-[-0.02em] text-ink tabular-nums sm:text-[52px]">
                <span aria-hidden="true">₹</span>
                <span
                  ref={digitsRef}
                  aria-hidden="true"
                  className="t-digit-group is-animating"
                >
                  {netWorthText.split("").map((char, index, chars) => (
                    <span
                      key={`${char}-${index}`}
                      className="t-digit"
                      data-stagger={
                        index === chars.length - 2
                          ? "1"
                          : index === chars.length - 1
                            ? "2"
                            : undefined
                      }
                    >
                      {char}
                    </span>
                  ))}
                </span>
                <span className="sr-only">₹{netWorthText}</span>
              </p>

              <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-hairline pt-5 text-left sm:gap-4">
                {STAT_ROWS.map((stat) => (
                  <div key={stat.key}>
                    <dt className="text-[13px] font-medium text-steel">
                      {stat.label}
                    </dt>
                    <dd className="mt-1 text-[15px] font-semibold tabular-nums text-charcoal sm:text-base">
                      ₹{inr.format(frame[stat.key])}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg bg-surface-soft px-4 py-3">
                <span className="text-[13px] font-medium text-steel">
                  Latest activity
                </span>
                {/* The span's React children stay pinned to frame zero, so
                    React never overwrites the text the swap sequence writes. */}
                <span className="text-sm font-semibold text-charcoal">
                  <span ref={swapRef} className="t-text-swap">
                    {DEMO_FRAMES[0].activity}
                  </span>
                </span>
              </div>

              <p className="mt-5 border-t border-hairline pt-5 text-[13px] leading-[1.4] text-stone">
                Demo account with sample data. Simulated clock: 1 real day is 1
                month in Wealthify.
              </p>
            </div>
          </div>
        </section>

        {/* ---------------- Features ---------------- */}
        <section id="features" className="bg-canvas px-6 pb-24 pt-24 sm:pt-32">
          <div className="mx-auto max-w-6xl">
            <SectionHeading
              eyebrow="Features"
              title="A whole financial life, with none of the risk"
              body="Every system in the simulator, built around one rule: the client never decides what anything costs, and no balance ever changes without a ledger entry behind it."
            />

            <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <Reveal key={feature.title} delay={(index % 3) * 0.06}>
                    <article className="flex h-full flex-col rounded-2xl border border-hairline bg-canvas p-6">
                      <span
                        className={`grid h-11 w-11 place-items-center rounded-xl ${feature.tint} text-ink`}
                      >
                        <Icon size={22} weight="duotone" />
                      </span>
                      <h3 className="mt-5 text-[19px] font-semibold tracking-[-0.01em] text-ink">
                        {feature.title}
                      </h3>
                      <p className="mt-2.5 text-[15px] leading-[1.6] text-steel">
                        {feature.body}
                      </p>
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------------- Payment experience ----------------
            The product's actual claim to being different, so it gets its own
            band and the real sequence rather than a screenshot of one. */}
        <section className="relative overflow-hidden bg-navy px-6 py-24 text-on-dark sm:py-32">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-[6%] top-[14%] h-3 w-3 rounded-full bg-[var(--brand-teal)]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-[7%] bottom-[16%] h-2.5 w-2.5 rounded-full bg-[var(--brand-pink)]"
          />

          <div className="relative mx-auto max-w-6xl">
            <Reveal className="mx-auto max-w-2xl text-center">
              <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-on-dark-muted">
                Payments
              </p>
              <h2 className="mt-3 text-balance text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[40px]">
                Payments that behave like payments
              </h2>
              <p className="mx-auto mt-4 max-w-[56ch] text-[16px] leading-[1.6] text-on-dark-muted">
                A real payment has a shape: a network, a bank, a reference, and a
                moment where it could still fail. UPI here runs the whole ten
                beats, with your PIN in the middle where it belongs.
              </p>
            </Reveal>

            <div className="mt-14 grid gap-4 lg:grid-cols-5">
              {/* The sequence */}
              <Reveal className="lg:col-span-3">
                <div className="h-full rounded-2xl border border-white/12 bg-white/[0.04] p-6 sm:p-7">
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="text-[15px] font-semibold">Pay with UPI</p>
                    <span className="t-num text-[12px] text-on-dark-muted">
                      10 steps
                    </span>
                  </div>

                  <ol className="mt-5 grid gap-0">
                    {UPI_STEPS.map((step, index) => (
                      <li key={step} className="flex items-start gap-3.5">
                        <span className="flex flex-col items-center self-stretch">
                          <span
                            className={`t-num grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                              index === 3
                                ? "bg-[var(--brand-yellow)] text-ink"
                                : "bg-white/10 text-on-dark-muted"
                            }`}
                          >
                            {index + 1}
                          </span>
                          {index < UPI_STEPS.length - 1 && (
                            <span
                              aria-hidden="true"
                              className="my-1 w-px flex-1 bg-white/12"
                            />
                          )}
                        </span>
                        <span
                          className={`pb-4 text-[14px] leading-[1.4] ${
                            index === 3 ? "font-medium text-on-dark" : "text-on-dark-muted"
                          }`}
                        >
                          {step}
                          {index === 3 && (
                            <span className="mt-0.5 block text-[12px] text-[var(--brand-yellow)]">
                              Your 4-digit PIN, asked for mid-flight
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </Reveal>

              {/* What makes it feel real */}
              <div className="grid gap-4 lg:col-span-2">
                {PAYMENT_NOTES.map((note, index) => {
                  const Icon = note.icon;
                  return (
                    <Reveal key={note.title} delay={index * 0.06} className="h-full">
                      <div className="flex h-full gap-4 rounded-2xl border border-white/12 bg-white/[0.04] p-5">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10">
                          <Icon size={20} weight="duotone" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[15px] font-semibold">{note.title}</p>
                          <p className="mt-1.5 text-[14px] leading-[1.55] text-on-dark-muted">
                            {note.body}
                          </p>
                        </div>
                      </div>
                    </Reveal>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- How it works ---------------- */}
        <section id="how-it-works" className="bg-surface px-6 py-24 sm:py-32">
          <div className="mx-auto max-w-6xl">
            <SectionHeading
              eyebrow="How it works"
              title="From empty wallet to net worth"
              body="Four steps, and the same loop over and over until the number looks like something you built."
            />

            <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <Reveal key={step.title} delay={index * 0.06} className="h-full">
                  <li className="flex h-full flex-col rounded-2xl border border-hairline bg-canvas p-6">
                    <span className="t-num text-[13px] font-semibold text-stone">
                      Step {index + 1}
                    </span>
                    <h3 className="mt-3 text-[19px] font-semibold tracking-[-0.01em] text-ink">
                      {step.title}
                    </h3>
                    <p className="mt-2.5 text-[15px] leading-[1.6] text-steel">
                      {step.body}
                    </p>
                  </li>
                </Reveal>
              ))}
            </ol>

            {/* The clock is the single most confusing thing about the app, so it
                is stated plainly rather than left to be discovered. */}
            <Reveal className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl border border-hairline bg-tint-cream px-6 py-5">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ink">
                    One real day is one simulated month
                  </p>
                  <p className="mt-1 text-[14px] leading-[1.55] text-[#523410]">
                    Salary, bills and interest all run on that clock. A payday-to-payday
                    month passes in about a day of real time — fast enough to watch a
                    decision come back around.
                  </p>
                </div>
                <span className="t-num rounded-full border border-hairline-strong bg-canvas px-3.5 py-1.5 text-[13px] font-medium text-charcoal">
                  1 day → 1 month
                </span>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ---------------- Markets ---------------- */}
        <section id="markets" className="bg-canvas px-6 py-24 sm:py-32">
          <div className="mx-auto max-w-6xl">
            <SectionHeading
              eyebrow="Markets"
              title="The market isn't open yet"
              body="Investing is the next sprint, not a promise we can demo today. Here is exactly what is being built."
            />

            <Reveal className="mx-auto mt-6 flex justify-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface-soft px-3.5 py-1.5 text-[13px] font-medium text-steel">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-[var(--brand-orange)]"
                />
                In development
              </span>
            </Reveal>

            <div className="mt-12 grid gap-4 sm:grid-cols-3">
              {MARKET_PREVIEW.map((item, index) => {
                const Icon = item.icon;
                return (
                  <Reveal key={item.title} delay={index * 0.06} className="h-full">
                    <div className="flex h-full flex-col rounded-2xl border border-dashed border-hairline-strong bg-surface-soft p-6">
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-canvas text-stone">
                        <Icon size={22} weight="duotone" />
                      </span>
                      <h3 className="mt-5 text-[17px] font-semibold text-slate">
                        {item.title}
                      </h3>
                      <p className="mt-2 text-[14px] leading-[1.6] text-steel">
                        {item.body}
                      </p>
                    </div>
                  </Reveal>
                );
              })}
            </div>

            <Reveal className="mt-6">
              <p className="text-center text-[14px] leading-[1.6] text-stone">
                Until it ships, savings is the only place money grows — and the
                store, the career ladder and the freelance board are where it comes from.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ---------------- FAQ ---------------- */}
        <section id="faq" className="bg-surface px-6 py-24 sm:py-32">
          <div className="mx-auto max-w-3xl">
            <SectionHeading
              eyebrow="FAQ"
              title="The questions everyone asks"
              body="Mostly variations on one: is any of this real?"
            />

            <Reveal className="mt-12">
              <div className="rounded-2xl border border-hairline bg-canvas px-6 sm:px-7">
                {FAQ.map((item, index) => (
                  <FaqItem
                    key={item.q}
                    item={item}
                    open={openFaq === index}
                    onToggle={() => setOpenFaq(openFaq === index ? -1 : index)}
                  />
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ---------------- Closing CTA ---------------- */}
        <section className="bg-navy px-6 py-24 text-center text-on-dark sm:py-28">
          <Reveal className="mx-auto max-w-2xl">
            <h2 className="text-balance text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[42px]">
              Start with ₹25,000 that isn&apos;t real
            </h2>
            <p className="mx-auto mt-5 max-w-[52ch] text-[16px] leading-[1.6] text-on-dark-muted">
              No card, no deposit, no bank details. Just an account, a salary to
              earn and a number to grow.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/signup"
                className="btn-on-dark focus-ring inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-medium"
              >
                Create your free account
                <ArrowRight size={15} weight="bold" />
              </Link>
              <Link
                href="/login"
                className="btn-outline-dark focus-ring inline-flex rounded-lg px-5 py-3 text-sm font-medium"
              >
                I already have one
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      {/* ---------------- Footer ---------------- */}
      <footer className="border-t border-hairline bg-canvas px-6 py-14">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-10">
            <div className="max-w-xs">
              <span className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-navy">
                  <Image
                    src="/wealthify-mark.png"
                    alt=""
                    width={114}
                    height={144}
                    className="h-[22px] w-auto"
                  />
                </span>
                <span className="text-[17px] font-semibold tracking-[-0.02em] text-charcoal">
                  Wealthify
                </span>
              </span>
              <p className="mt-4 text-[14px] leading-[1.6] text-steel">
                A financial life simulator. Earn it, spend it, save it — with money
                that only exists here.
              </p>
            </div>

            <nav aria-label="Product" className="grid gap-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-stone">
                Product
              </p>
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="focus-ring w-fit rounded text-[14px] text-steel hover:text-charcoal"
                >
                  {link.label}
                </a>
              ))}
            </nav>

            <nav aria-label="Account" className="grid gap-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-stone">
                Account
              </p>
              <Link
                href="/login"
                className="focus-ring w-fit rounded text-[14px] text-steel hover:text-charcoal"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="focus-ring w-fit rounded text-[14px] text-steel hover:text-charcoal"
              >
                Create an account
              </Link>
            </nav>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-hairline pt-6">
            <p className="text-[13px] text-stone">
              100% virtual money. No deposits, no bank connections, no real risk.
            </p>
            <p className="text-[13px] text-stone">
              © {CURRENT_YEAR} Wealthify
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
