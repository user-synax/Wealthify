"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DashboardShell from "../../components/dashboard-shell";
import PaymentSettings from "../../components/payment-settings";
import { useAuth } from "../../components/auth-provider";
import { formatPaise } from "../../lib/api";
import { updateProfile } from "../../lib/auth";
import Avatar, { isAvatarUrl } from "../../components/avatar";

const AVATARS = ["", "🌱", "🚀", "💡", "🎯", "🪙", "📈", "🏆", "💎"];

function ProfileEditor({ user, applyUser }) {
  const [bio, setBio] = useState(user.bio ?? "");
  const [avatar, setAvatar] = useState(user.avatar ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function onSave(event) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const data = await updateProfile({ bio, avatar });
      applyUser(data.user);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSave} className="mt-6 border-t border-hairline pt-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[17px] font-semibold text-charcoal">Public profile</h2>
          <p className="mt-1 text-sm text-steel">Shown to other Wealthify players.</p>
        </div>
        <Link href={`/profile/${user.username}`} className="btn-ghost focus-ring rounded-lg px-3 py-2 text-sm font-medium">
          View
        </Link>
      </div>

      <label className="mt-5 block text-sm font-medium text-charcoal" htmlFor="bio">
        Bio
      </label>
      <textarea
        id="bio"
        value={bio}
        onChange={(event) => setBio(event.target.value)}
        maxLength={160}
        rows={3}
        placeholder="What are you building?"
        className="focus-ring mt-2 w-full resize-none rounded-lg border border-hairline-strong bg-canvas px-3 py-2.5 text-sm text-ink outline-none placeholder:text-stone"
      />
      <div className="mt-1 text-right text-xs text-stone">{bio.length}/160</div>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-charcoal">Avatar</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {AVATARS.map((option) => (
            <button
              key={option || "initial"}
              type="button"
              aria-label={option ? `Choose ${option} avatar` : "Choose initial avatar"}
              aria-pressed={avatar === option}
              onClick={() => setAvatar(option)}
              className={`focus-ring grid h-11 w-11 place-items-center rounded-full border text-lg ${
                avatar === option ? "border-primary bg-tint-lavender" : "border-hairline bg-surface-soft"
              }`}
            >
              {option || user.username.slice(0, 1).toUpperCase()}
            </button>
          ))}
        </div>
        <label className="mt-4 block text-sm font-medium text-charcoal" htmlFor="avatar-url">
          Or use an image URL
        </label>
        <input
          id="avatar-url"
          type="url"
          value={isAvatarUrl(avatar) ? avatar : ""}
          onChange={(event) => setAvatar(event.target.value)}
          maxLength={500}
          placeholder="https://example.com/avatar.jpg"
          className="focus-ring mt-2 w-full rounded-lg border border-hairline-strong bg-canvas px-3 py-2.5 text-sm text-ink outline-none placeholder:text-stone"
        />
      </fieldset>

      <div className="mt-5 flex items-center gap-3">
        <button type="submit" disabled={saving} className="btn-primary focus-ring rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-60">
          {saving ? "Saving…" : "Save profile"}
        </button>
        {saved && <span className="text-sm text-success">Saved</span>}
        {error && <span role="alert" className="text-sm text-error">{error}</span>}
      </div>
    </form>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { status, user, wallet, logout, applyUser } = useAuth();

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
          <Avatar value={user.avatar} name={user.username} className="h-14 w-14 text-xl" />
          <div>
            <h1 className="text-[24px] font-semibold tracking-[-0.01em] text-ink">
              {user.username}
            </h1>
            <p className="mt-0.5 text-sm text-steel">{user.email}</p>
          </div>
        </div>

        <ProfileEditor user={user} applyUser={applyUser} />

        <p className="mt-4 inline-flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-surface px-3 py-1.5 text-[13px] font-medium text-charcoal">
            {user.career} · Level {user.level} · {user.xp} XP
          </span>
          {user.streak > 0 && (
            <span className="rounded-full bg-[color-mix(in_srgb,var(--brand-orange)_14%,white)] px-3 py-1.5 text-[13px] font-medium text-[var(--brand-orange)]">
              {user.streak} day streak · best {user.bestStreak}
            </span>
          )}
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

      <div className="mt-4">
        <PaymentSettings />
      </div>
    </DashboardShell>
  );
}
