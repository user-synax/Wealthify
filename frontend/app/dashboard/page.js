"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Briefcase,
  CalendarBlank,
  Clock,
  Fire,
  PiggyBank,
  Receipt,
  Storefront,
  TrendUp,
} from "@phosphor-icons/react";
import DashboardShell from "../../components/dashboard-shell";
import TransactionRow from "../../components/transaction-row";
import ReceiptModal from "../../components/receipt-modal";
import { useAuth } from "../../components/auth-provider";
import { useNotices } from "../../lib/use-notices";
import { fetchTransactions } from "../../lib/economy";
import { formatDuration, formatPaise } from "../../lib/api";

/* The overview is a *summary*: it shows the four numbers that matter, what is
   due, and the last handful of entries. Full history lives on /activity and the
   bills themselves on /expenses, so this page never has to paginate. */

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function LoadingState() {
  return (
    <DashboardShell>
      <div className="t-skel h-8 w-56 rounded-lg" />
      <div className="t-skel mt-2 h-4 w-72 rounded-lg" />
      <div className="mt-6 rounded-xl border border-hairline bg-canvas p-6 sm:p-8">
        <div className="t-skel h-4 w-24 rounded" />
        <div className="t-skel mt-3 h-12 w-64 rounded-lg" />
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="t-skel h-20 rounded-lg" />
          <div className="t-skel h-20 rounded-lg" />
          <div className="t-skel h-20 rounded-lg" />
          <div className="t-skel h-20 rounded-lg" />
        </div>
      </div>
    </DashboardShell>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { status, user, wallet, bills, clock, refreshWallet } = useAuth();
  const [recent, setRecent] = useState(null);
  const [notices, setNotices] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [nextCycleIn, setNextCycleIn] = useState(0);

  // Covers the expired-cookie case: the route guard only sees that a
  // cookie exists, while the provider knows the session is dead.
  useEffect(() => {
    if (status === "unauthenticated") router.push("/login?next=/dashboard");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    fetchTransactions({ limit: 6 })
      .then((data) => {
        if (!cancelled) setRecent(data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setRecent([]);
      });
    // The wallet route is the economy sync: it is what pays the salary and
    // collects autopay when a new simulated month has begun.
    refreshWallet()
      .then((data) => {
        if (!cancelled && data?.notices) setNotices(data.notices);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status, refreshWallet]);

  useNotices(notices);

  /* Countdown to the next simulated month, ticked locally from the server's
     timestamp so the label stays right without polling. */
  useEffect(() => {
    if (!clock?.nextCycleAt) return;
    const tick = () =>
      setNextCycleIn(Math.max(0, new Date(clock.nextCycleAt).getTime() - Date.now()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [clock?.nextCycleAt]);

  if (status !== "authenticated" || !user) return <LoadingState />;

  const netWorth =
    (wallet?.cashBalance ?? 0) + (wallet?.savingsBalance ?? 0) + (wallet?.totalInvested ?? 0);

  const tiles = [
    { label: "Cash", value: wallet?.cashBalance ?? 0 },
    { label: "Savings", value: wallet?.savingsBalance ?? 0 },
    { label: "Total earned", value: wallet?.totalEarned ?? 0 },
    { label: "Total spent", value: wallet?.totalSpent ?? 0 },
  ];

  const actions = [
    {
      href: "/income",
      label: "Earn",
      body: "Gigs, tasks and your salary",
      icon: <Briefcase size={20} weight="duotone" />,
      badge: null,
    },
    {
      href: "/expenses",
      label: "Pay bills",
      body: bills?.dueCount
        ? `${formatPaise(bills.dueTotal)} due`
        : "Everything is settled",
      icon: <Receipt size={20} weight="duotone" />,
      badge: bills?.dueCount ?? 0,
    },
    {
      href: "/store",
      label: "Store",
      body: "Gear that raises your payouts",
      icon: <Storefront size={20} weight="duotone" />,
      badge: null,
    },
    {
      href: "/activity",
      label: "Activity",
      body: "Every entry, with receipts",
      icon: <TrendUp size={20} weight="duotone" />,
      badge: null,
    },
  ];

  return (
    <DashboardShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-steel">
            {user.career} · Level {user.level}
            {user.streak > 0 && (
              <>
                {" · "}
                <span className="inline-flex items-center gap-1 text-[var(--brand-orange)]">
                  <Fire size={13} weight="fill" />
                  {user.streak} day streak
                </span>
              </>
            )}
          </p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.01em] text-ink sm:text-[32px]">
            {greeting()}, {user.username}
          </h1>
        </div>

        {clock && (
          <div className="flex items-center gap-2.5 rounded-xl border border-hairline bg-canvas px-4 py-2.5">
            <CalendarBlank size={18} className="text-steel" />
            <div>
              <p className="text-[12px] font-medium text-steel">Simulated month {clock.cycle}</p>
              <p className="text-[13px] font-semibold text-charcoal">
                {clock.label} ·{" "}
                <span className="t-num inline-flex items-center gap-1">
                  <Clock size={12} />
                  {formatDuration(nextCycleIn)}
                </span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Net worth hero */}
      <section className="mt-6 rounded-xl border border-hairline bg-canvas p-6 shadow-[rgba(15,15,15,0.08)_0px_4px_12px_0px] sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 className="text-sm font-medium text-steel">Net worth</h2>
          <span
            className={`rounded-full px-2.5 py-1 text-[13px] font-semibold ${
              (bills?.dueCount ?? 0) > 0
                ? "bg-[color-mix(in_srgb,var(--brand-orange)_14%,white)] text-[var(--brand-orange)]"
                : "bg-tint-mint text-success"
            }`}
          >
            {(bills?.dueCount ?? 0) > 0
              ? `${bills.dueCount} bill${bills.dueCount === 1 ? "" : "s"} due`
              : "On track"}
          </span>
        </div>

        <p className="t-num mt-3 text-[36px] font-semibold leading-none tracking-[-0.02em] text-ink sm:text-[52px]">
          {formatPaise(netWorth)}
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-hairline pt-5 text-left lg:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-lg bg-surface-soft px-4 py-3">
              <dt className="text-[13px] font-medium text-steel">{tile.label}</dt>
              <dd className="t-num mt-1 text-[15px] font-semibold text-charcoal">
                {formatPaise(tile.value)}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-5 border-t border-hairline pt-5 text-[13px] leading-[1.4] text-stone">
          Cash plus savings{wallet?.totalInvested ? " plus what you hold in markets" : ""}. Every
          figure is served by the ledger — nothing on this screen is computed in the browser.
        </p>
      </section>

      {/* Quick actions */}
      <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="focus-ring group flex items-start gap-3 rounded-xl border border-hairline bg-canvas p-4 transition-colors hover:bg-surface-soft"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface text-charcoal">
              {action.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-charcoal">{action.label}</span>
                {action.badge > 0 && (
                  <span className="t-num rounded-full bg-[color-mix(in_srgb,var(--brand-orange)_16%,white)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--brand-orange)]">
                    {action.badge}
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-[12px] leading-[1.5] text-steel">
                {action.body}
              </span>
            </span>
            <ArrowRight
              size={14}
              className="mt-1 shrink-0 text-stone transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        ))}
      </section>

      {/* Activity + roadmap */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-xl border border-hairline bg-canvas p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[18px] font-semibold text-ink">Latest activity</h2>
            <Link
              href="/activity"
              className="focus-ring rounded text-[13px] font-medium text-link hover:underline"
            >
              View all
            </Link>
          </div>

          {recent === null ? (
            <div className="mt-4 grid gap-1">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 px-3.5 py-3">
                  <div className="t-skel h-10 w-10 rounded-lg" />
                  <div className="flex-1">
                    <div className="t-skel h-3.5 w-2/5 rounded" />
                    <div className="t-skel mt-2 h-3 w-1/4 rounded" />
                  </div>
                  <div className="t-skel h-4 w-16 rounded" />
                </div>
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="mt-4 flex flex-col items-center rounded-lg bg-surface-soft px-4 py-8 text-center">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-canvas text-steel">
                <Receipt size={22} />
              </span>
              <p className="mt-3 text-sm font-semibold text-charcoal">No activity yet</p>
              <p className="mt-1 max-w-[36ch] text-sm leading-[1.5] text-steel">
                Earn your first salary or make a purchase and it will show up here.
              </p>
              <Link
                href="/income"
                className="btn-primary focus-ring mt-4 rounded-lg px-4 py-2.5 text-[13px] font-medium"
              >
                Find some work
              </Link>
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-hairline-soft">
              {recent.map((transaction) => (
                <li key={transaction.id}>
                  <TransactionRow
                    transaction={transaction}
                    dense
                    onOpen={(row) => setOpenId(row.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-hairline bg-canvas p-5">
          <h2 className="text-[18px] font-semibold text-ink">Coming soon</h2>
          <ul className="mt-4 grid gap-3">
            <li className="flex gap-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface text-charcoal">
                <TrendUp size={20} weight="duotone" />
              </span>
              <span>
                <span className="block text-[15px] font-semibold text-charcoal">Markets</span>
                <span className="mt-0.5 block text-sm leading-[1.5] text-steel">
                  Simulated stocks with live-ish prices, portfolio and P&amp;L.
                </span>
              </span>
            </li>
            <li className="flex gap-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface text-charcoal">
                <PiggyBank size={20} weight="duotone" />
              </span>
              <span>
                <span className="block text-[15px] font-semibold text-charcoal">
                  Savings goals
                </span>
                <span className="mt-0.5 block text-sm leading-[1.5] text-steel">
                  Emergency fund tracker with a target and a funded percentage.
                </span>
              </span>
            </li>
          </ul>

          <p className="mt-5 border-t border-hairline pt-4 text-[12px] leading-[1.5] text-stone">
            Simulated clock: one real day is one simulated month. Your salary is credited and your
            bills roll over on that calendar.
          </p>
        </section>
      </div>

      <ReceiptModal open={Boolean(openId)} transactionId={openId} onClose={() => setOpenId(null)} />
    </DashboardShell>
  );
}
