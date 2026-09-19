"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import DashboardShell from "../../../components/dashboard-shell";
import { useAuth } from "../../../components/auth-provider";
import { formatDate, formatPaise } from "../../../lib/api";
import { fetchPublicProfile } from "../../../lib/social";
import Avatar from "../../../components/avatar";

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { status } = useAuth();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push(`/login?next=/profile/${params.username}`);
  }, [status, router, params.username]);

  useEffect(() => {
    if (status !== "authenticated" || !params.username) return;
    const controller = new AbortController();
    fetchPublicProfile(params.username, controller.signal)
      .then((data) => setProfile(data.profile))
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.code === "NOT_FOUND" ? "That profile does not exist." : "Profile is unavailable right now.");
      });
    return () => controller.abort();
  }, [status, params.username]);

  if (status !== "authenticated") return <DashboardShell><div className="t-skel h-72 rounded-xl" /></DashboardShell>;
  if (error) return <DashboardShell><p role="alert" className="rounded-xl border border-hairline bg-canvas px-5 py-10 text-center text-sm text-error">{error}</p></DashboardShell>;
  if (!profile) return <DashboardShell><div className="t-skel h-72 rounded-xl" /></DashboardShell>;

  return (
    <DashboardShell>
      <Link href="/leaderboard" className="focus-ring text-sm font-medium text-link">Back to leaderboard</Link>
      <section className="mt-4 rounded-xl border border-hairline bg-canvas p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-center gap-4">
            <Avatar value={profile.avatar} name={profile.username} className="h-16 w-16 text-xl" />
            <div><h1 className="text-[26px] font-semibold tracking-[-0.02em] text-ink">{profile.username}</h1><p className="mt-1 text-sm text-steel">{profile.career} · Level {profile.level}</p></div>
          </div>
          <div className="rounded-lg bg-tint-yellow px-4 py-3"><p className="text-xs font-medium text-charcoal">Net worth</p><p className="mt-1 text-xl font-semibold tabular-nums text-charcoal">{formatPaise(profile.netWorth)}</p></div>
        </div>
        {profile.bio ? <p className="mt-6 max-w-2xl text-[15px] leading-6 text-charcoal">{profile.bio}</p> : <p className="mt-6 text-sm text-steel">No bio yet.</p>}
        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-hairline pt-5 sm:grid-cols-4">
          <div><p className="text-xs font-medium text-steel">XP</p><p className="mt-1 font-semibold tabular-nums text-charcoal">{profile.xp}</p></div>
          <div><p className="text-xs font-medium text-steel">Current streak</p><p className="mt-1 font-semibold tabular-nums text-charcoal">{profile.streak} days</p></div>
          <div><p className="text-xs font-medium text-steel">Best streak</p><p className="mt-1 font-semibold tabular-nums text-charcoal">{profile.bestStreak} days</p></div>
          <div><p className="text-xs font-medium text-steel">Joined</p><p className="mt-1 font-semibold text-charcoal">{formatDate(profile.createdAt)}</p></div>
        </div>
      </section>
    </DashboardShell>
  );
}