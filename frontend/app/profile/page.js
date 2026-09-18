"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchMe, formatPaise, logout } from "../../lib/auth";

export default function ProfilePage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setState("unauthenticated");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onLogout() {
    await logout().catch(() => {});
    router.push("/login");
  }

  if (state === "loading") {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-canvas px-6">
        <div className="w-full max-w-md rounded-xl border border-hairline bg-canvas p-6 sm:p-8">
          <div className="h-7 w-40 rounded-lg bg-surface" />
          <div className="mt-4 h-12 w-56 rounded-lg bg-surface" />
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="h-16 rounded-lg bg-surface" />
            <div className="h-16 rounded-lg bg-surface" />
          </div>
        </div>
      </main>
    );
  }

  if (state === "unauthenticated") {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-canvas px-6">
        <div className="w-full max-w-md rounded-xl border border-hairline bg-canvas p-6 text-center sm:p-8">
          <h1 className="text-[22px] font-semibold text-ink">You are logged out</h1>
          <p className="mt-2 text-sm text-steel">
            Log in to see your profile and wallet.
          </p>
          <Link
            href="/login"
            className="btn-primary focus-ring mt-6 inline-flex h-11 items-center justify-center rounded-lg px-5 text-sm font-medium"
          >
            Log in
          </Link>
        </div>
      </main>
    );
  }

  const { user, wallet } = data;
  const rows = wallet
    ? [
        { label: "Cash", value: formatPaise(wallet.cashBalance) },
        { label: "Savings", value: formatPaise(wallet.savingsBalance) },
        { label: "Total earned", value: formatPaise(wallet.totalEarned) },
        { label: "Total spent", value: formatPaise(wallet.totalSpent) },
      ]
    : [];

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-canvas px-6 py-16">
      <div className="w-full max-w-md rounded-xl border border-hairline bg-canvas p-6 sm:p-8">
        <p className="text-sm text-steel">
          {user.career} · Level {user.level} · {user.xp} XP
        </p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.01em] text-ink">
          {user.username}
        </h1>
        <p className="mt-1 text-sm text-steel">{user.email}</p>

        <div className="mt-6 grid grid-cols-2 gap-3">
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
            href="/"
            className="btn-ghost focus-ring inline-flex h-11 flex-1 items-center justify-center rounded-lg px-4 text-sm font-medium"
          >
            Home
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
    </main>
  );
}
