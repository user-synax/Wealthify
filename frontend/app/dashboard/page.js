"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Receipt, Storefront, TrendUp } from "@phosphor-icons/react";
import DashboardShell from "../../components/dashboard-shell";
import { useAuth } from "../../components/auth-provider";
import { formatPaise } from "../../lib/auth";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const ROADMAP = [
  {
    icon: <TrendUp size={22} weight="duotone" />,
    title: "Markets",
    body: "Simulated stocks with live-ish prices, portfolio and P&L.",
  },
  {
    icon: <Storefront size={22} weight="duotone" />,
    title: "Store",
    body: "Virtual goods with real payment feedback and receipts.",
  },
  {
    icon: <Briefcase size={22} weight="duotone" />,
    title: "Jobs",
    body: "Career ladder, freelance gigs, daily tasks and streaks.",
  },
];

function LoadingState() {
  return (
    <DashboardShell>
      <div className="h-8 w-56 rounded-lg bg-hairline-soft" />
      <div className="mt-2 h-4 w-72 rounded-lg bg-hairline-soft" />
      <div className="mt-6 rounded-xl border border-hairline bg-canvas p-6 sm:p-8">
        <div className="h-4 w-24 rounded bg-hairline-soft" />
        <div className="mt-3 h-12 w-64 rounded-lg bg-hairline-soft" />
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="h-20 rounded-lg bg-surface" />
          <div className="h-20 rounded-lg bg-surface" />
          <div className="h-20 rounded-lg bg-surface" />
          <div className="h-20 rounded-lg bg-surface" />
        </div>
      </div>
    </DashboardShell>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { status, user, wallet } = useAuth();

  // Covers the expired-cookie case: the route guard only sees that a
  // cookie exists, while the provider knows the session is dead.
  useEffect(() => {
    if (status === "unauthenticated") router.push("/login?next=/dashboard");
  }, [status, router]);

  if (status !== "authenticated" || !user) return <LoadingState />;

  const netWorth = (wallet?.cashBalance ?? 0) + (wallet?.savingsBalance ?? 0);
  const tiles = wallet
    ? [
        { label: "Cash", value: formatPaise(wallet.cashBalance) },
        { label: "Savings", value: formatPaise(wallet.savingsBalance) },
        { label: "Total earned", value: formatPaise(wallet.totalEarned) },
        { label: "Total invested", value: formatPaise(wallet.totalInvested) },
      ]
    : [];

  return (
    <DashboardShell>
      <p className="text-sm text-steel">
        {user.career} · Level {user.level} · {user.xp} XP
      </p>
      <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.01em] text-ink sm:text-[32px]">
        {greeting()}, {user.username}
      </h1>

      {/* Net worth hero */}
      <section className="mt-6 rounded-xl border border-hairline bg-canvas p-6 shadow-[rgba(15,15,15,0.08)_0px_4px_12px_0px] sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 className="text-sm font-medium text-steel">Net worth</h2>
          <span className="rounded-full bg-tint-mint px-2.5 py-1 text-[13px] font-semibold text-success">
            On track
          </span>
        </div>
        <p className="mt-3 text-[36px] font-semibold leading-none tracking-[-0.02em] text-ink tabular-nums sm:text-[52px]">
          {formatPaise(netWorth)}
        </p>
        <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-hairline pt-5 text-left lg:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-lg bg-surface-soft px-4 py-3">
              <dt className="text-[13px] font-medium text-steel">{tile.label}</dt>
              <dd className="mt-1 text-[15px] font-semibold tabular-nums text-charcoal">
                {tile.value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 border-t border-hairline pt-5 text-[13px] leading-[1.4] text-stone">
          Cash plus savings. Investments join this figure when markets ship.
        </p>
      </section>

      {/* Activity + roadmap */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-hairline bg-canvas p-6">
          <h2 className="text-[18px] font-semibold text-ink">Latest activity</h2>
          <div className="mt-4 flex flex-col items-center rounded-lg bg-surface-soft px-4 py-8 text-center">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-canvas text-steel">
              <Receipt size={22} />
            </span>
            <p className="mt-3 text-sm font-semibold text-charcoal">No activity yet</p>
            <p className="mt-1 max-w-[36ch] text-sm leading-[1.5] text-steel">
              Earn your first salary or make a purchase and it will show up here.
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-hairline bg-canvas p-6">
          <h2 className="text-[18px] font-semibold text-ink">Coming soon</h2>
          <ul className="mt-4 grid gap-3">
            {ROADMAP.map((item) => (
              <li key={item.title} className="flex gap-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface text-charcoal">
                  {item.icon}
                </span>
                <span>
                  <span className="block text-[15px] font-semibold text-charcoal">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-sm leading-[1.5] text-steel">
                    {item.body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </DashboardShell>
  );
}
