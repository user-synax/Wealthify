"use client";

import Image from "next/image";
import { List, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

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
                <a
                  href="#log-in"
                  className="btn-ghost focus-ring hidden rounded-lg px-4 py-2.5 text-sm font-medium sm:inline-flex"
                >
                  Log in
                </a>
                <a
                  href="#get-started"
                  className="btn-primary focus-ring inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-medium"
                >
                  Get started
                </a>

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
              <a
                href="#log-in"
                onClick={closeMenu}
                className="btn-ghost focus-ring rounded-lg px-4 py-2.5 text-center text-sm font-medium"
              >
                Log in
              </a>
              <a
                href="#get-started"
                onClick={closeMenu}
                className="btn-primary focus-ring rounded-lg px-4 py-2.5 text-center text-sm font-medium"
              >
                Get started
              </a>
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
                  href="#get-started"
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

        {/* The remaining landing sections land here next. */}
        <section id="features" className="bg-canvas px-6 pb-24 pt-24 sm:pt-32">
          <div className="mx-auto max-w-6xl">
            <p className="text-sm text-steel">
              Placeholder: the remaining landing sections land here next.
            </p>
            <div
              aria-hidden="true"
              className="mt-8 h-[70dvh] rounded-2xl bg-surface-soft"
            />
          </div>
        </section>
      </main>
    </>
  );
}
