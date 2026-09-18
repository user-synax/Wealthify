"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DashboardShell from "../../components/dashboard-shell";
import { useAuth } from "../../components/auth-provider";
import { formatPaise } from "../../lib/auth";

export default function ProfilePage() {
  const router = useRouter();
  const { status, user, wallet, logout } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login?next=/profile");
  }, [status, router]);

  if (status !== "authenticated" || !user) {
    return (
      <DashboardShell>
        <div className="rounded-xl border border-hairline bg-canvas p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-hairline-soft" />
            <div>
              <div className="h-6 w-40 rounded bg-hairline-soft" />
              <div className="mt-2 h-4 w-52 rounded bg-hairline-soft" />
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="h-16 rounded-lg bg-surface" />
            <div className="h-16 rounded-lg bg-surface" />
          </div>
        </div>
      </DashboardShell>
    );
  }

  const rows = wallet
    ? [
        { label: "Cash", value: formatPaise(wallet.cashBalance) },
        { label: "Savings", value: formatPaise(wallet.savingsBalance) },
        { label: "Total earned", value: formatPaise(wallet.totalEarned) },
        { label: "Total spent", value: formatPaise(wallet.totalSpent) },
        { label: "Total invested", value: formatPaise(wallet.totalInvested) },
      ]
    : [];

  async function onLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <DashboardShell>
      <div className="rounded-xl border border-hairline bg-canvas p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-navy text-xl font-semibold text-on-dark"
          >
            {user.username.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <h1 className="text-[24px] font-semibold tracking-[-0.01em] text-ink">
              {user.username}
            </h1>
            <p className="mt-0.5 text-sm text-steel">{user.email}</p>
          </div>
        </div>

        <p className="mt-4 inline-flex rounded-full bg-surface px-3 py-1.5 text-[13px] font-medium text-charcoal">
          {user.career} · Level {user.level} · {user.xp} XP
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-hairline pt-5 lg:grid-cols-3">
          {rows.map((row) => (
            <div key={row.label} className="rounded-lg bg-surface-soft px-4 py-3">
              <p className="text-[13px] font-medium text-steel">{row.label}</p>
              <p className="mt-1 text-[15px] font-semibold tabular-nums text-charcoal">
                {row.value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-2 border-t border-hairline pt-5">
          <Link
            href="/dashboard"
            className="btn-ghost focus-ring inline-flex h-11 flex-1 items-center justify-center rounded-lg px-4 text-sm font-medium"
          >
            Dashboard
          </Link>
          <button
            type="button"
            onClick={onLogout}
            className="btn-primary focus-ring inline-flex h-11 flex-1 items-center justify-center rounded-lg px-4 text-sm font-medium"
          >
            Log out
          </button>
        </div>
      </div>
    </DashboardShell>
  );
}
