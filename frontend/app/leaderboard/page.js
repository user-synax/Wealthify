"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy } from "@phosphor-icons/react";
import DashboardShell from "../../components/dashboard-shell";
import { useAuth } from "../../components/auth-provider";
import { formatPaise } from "../../lib/api";
import { fetchLeaderboard } from "../../lib/social";
import Avatar from "../../components/avatar";

function LeaderboardAvatar({ item }) {
  return (
    <Avatar value={item.avatar} name={item.username} className="h-10 w-10 text-sm" />
  );
}

export default function LeaderboardPage() {
  const { status, user } = useAuth();
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();
    fetchLeaderboard(controller.signal)
      .then((data) => setItems(data.items ?? []))
      .catch((err) => {
        if (err.name !== "AbortError") setError("Leaderboard is unavailable right now.");
      });
    return () => controller.abort();
  }, [status]);

  if (status !== "authenticated") {
    return <DashboardShell><div className="t-skel h-72 rounded-xl" /></DashboardShell>;
  }

  return (
    <DashboardShell>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">All-time ranking</p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.02em] text-ink">Leaderboard</h1>
          <p className="mt-2 text-sm text-steel">See how your virtual net worth compares.</p>
        </div>
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-tint-yellow text-charcoal"><Trophy size={22} weight="fill" /></span>
      </div>

      <section className="mt-6 overflow-hidden rounded-xl border border-hairline bg-canvas">
        <div className="grid grid-cols-[3rem_1fr_auto] gap-3 border-b border-hairline bg-surface-soft px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-steel">
          <span>Rank</span><span>Player</span><span>Net worth</span>
        </div>
        {error && <p role="alert" className="px-4 py-8 text-center text-sm text-error">{error}</p>}
        {!error && !items && <div className="space-y-3 px-4 py-5"><div className="t-skel h-12 rounded-lg" /><div className="t-skel h-12 rounded-lg" /><div className="t-skel h-12 rounded-lg" /></div>}
        {items?.map((item) => (
          <Link
            key={item.id}
            href={`/profile/${item.username}`}
            className={`focus-ring grid grid-cols-[3rem_1fr_auto] items-center gap-3 border-b border-hairline-soft px-4 py-3.5 last:border-b-0 hover:bg-surface-soft ${item.username === user.username ? "bg-tint-lavender/40" : ""}`}
          >
            <span className="text-sm font-semibold tabular-nums text-steel">#{item.rank}</span>
            <span className="flex min-w-0 items-center gap-3"><LeaderboardAvatar item={item} /><span className="min-w-0"><span className="block truncate text-sm font-semibold text-charcoal">{item.username}</span><span className="block truncate text-xs text-steel">{item.career} · Level {item.level}</span></span></span>
            <span className="text-right text-sm font-semibold tabular-nums text-charcoal">{formatPaise(item.netWorth)}</span>
          </Link>
        ))}
        {items?.length === 0 && <p className="px-4 py-8 text-center text-sm text-steel">No players have joined yet.</p>}
      </section>
    </DashboardShell>
  );
}