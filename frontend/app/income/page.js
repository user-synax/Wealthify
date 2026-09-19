"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Clock,
  Fire,
  Medal,
  Timer,
  Trophy,
  WarningCircle,
} from "@phosphor-icons/react";
import DashboardShell from "../../components/dashboard-shell";
import ReceiptModal from "../../components/receipt-modal";
import { CatalogIcon } from "../../components/icon-map";
import { useAuth } from "../../components/auth-provider";
import { useToast } from "../../components/toast-provider";
import { useNotices } from "../../lib/use-notices";
import { completeTask, fetchIncome, workGig } from "../../lib/economy";
import { formatDuration, formatPaise, newIdempotencyKey } from "../../lib/api";
import { msUntil, useNow } from "../../lib/use-now";

/* ----------------------------------------------------------------------------
   Income.

   Three layers, deliberately ordered by how much agency they give the user:
   the career pays on its own, gigs are what you do when rent is due, and daily
   tasks are the habit loop. The cooldowns are counted down against a single
   1-second tick on the page rather than a timer per card — ten intervals for
   ten jobs is ten chances to leak one on unmount.

   The reward shown on each button is `expectedReward` from the server, which
   already includes the gear bonus. Buying a laptop in the store visibly raises
   the number here, which is the whole point of that cross-system link.
   -------------------------------------------------------------------------- */

const DIFFICULTY_TONE = {
  Easy: "border-hairline text-steel",
  Medium: "border-[color-mix(in_srgb,var(--link-blue)_35%,white)] text-link",
  Hard: "border-[color-mix(in_srgb,var(--brand-orange)_40%,white)] text-[var(--brand-orange)]",
};

export default function IncomePage() {
  const router = useRouter();
  const { status, user, wallet, applyWallet, applyUser, refresh } = useAuth();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [receipt, setReceipt] = useState(null);

  // One key per in-flight action, kept so a retry after a network drop reuses
  // it and the ledger replays instead of paying twice.
  const keys = useRef(new Map());

  const load = useCallback(async () => {
    try {
      const result = await fetchIncome();
      setData(result);
      applyWallet(result.wallet, result.clock);
      return result;
    } catch (err) {
      if (err?.status === 401) router.push("/login?next=/income");
      return null;
    } finally {
      setLoading(false);
    }
  }, [router, applyWallet]);

  /* Initial fetch spelled out so every state write happens in a promise
     callback rather than in the effect body; `load` stays for the refresh that
     follows an action. */
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?next=/income");
      return;
    }
    if (status !== "authenticated") return;

    let cancelled = false;
    fetchIncome()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        applyWallet(result.wallet, result.clock);
      })
      .catch((err) => {
        if (!cancelled && err?.status === 401) router.push("/login?next=/income");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status, router, applyWallet]);

  useNotices(data?.notices);

  /* One tick drives every cooldown on the page. */
  const now = useNow();

  const keyFor = (id) => {
    if (!keys.current.has(id)) keys.current.set(id, newIdempotencyKey());
    return keys.current.get(id);
  };

  async function runGig(gig) {
    setBusyId(gig.id);
    try {
      const result = await workGig({ id: gig.id, clientKey: keyFor(`gig:${gig.id}`) });
      keys.current.delete(`gig:${gig.id}`);
      setReceipt(result.receipt);
      if (result.receipt?.wallet) applyWallet(result.receipt.wallet, result.clock);
      applyUser({
        xp: result.receipt.xp ?? user?.xp,
        level: result.receipt.level ?? user?.level,
      });
      await load();
    } catch (err) {
      keys.current.delete(`gig:${gig.id}`);
      toast.push({
        tone: "warning",
        title: err?.code === "GIG_COOLDOWN" ? "Not ready yet" : "Could not log that job",
        body: err?.message ?? "Try again in a moment.",
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function runTask(task) {
    setBusyId(task.id);
    try {
      const result = await completeTask({ id: task.id, clientKey: keyFor(`task:${task.id}`) });
      keys.current.delete(`task:${task.id}`);
      setReceipt(result.receipt);
      if (result.receipt?.wallet) applyWallet(result.receipt.wallet, result.clock);
      await load();
      await refresh();
    } catch (err) {
      keys.current.delete(`task:${task.id}`);
      toast.push({
        tone: "warning",
        title: "Could not claim that task",
        body: err?.message ?? "Try again in a moment.",
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const careerProgress = useMemo(() => {
    if (!data?.career) return 0;
    return Math.round((data.career.progressToNext ?? 0) * 100);
  }, [data]);

  const salaryCountdown = msUntil(data?.salary?.nextAt, now);

  return (
    <DashboardShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.01em] text-ink sm:text-[32px]">
            Income
          </h1>
          <p className="mt-1 text-sm leading-[1.5] text-steel">
            Your salary arrives on its own. Everything else is work you choose to do.
          </p>
        </div>
        <div className="rounded-xl border border-hairline bg-canvas px-4 py-3">
          <p className="text-[12px] font-medium text-steel">Available balance</p>
          <p className="t-num mt-0.5 text-[20px] font-semibold text-ink">
            {formatPaise(wallet?.cashBalance ?? 0)}
          </p>
        </div>
      </div>

      {/* Career + salary + streak */}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-hairline bg-canvas p-5 lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-surface text-charcoal">
                <Medal size={22} weight="duotone" />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone">
                  Career
                </p>
                <p className="text-[20px] font-semibold text-ink">
                  {data?.career?.title ?? user?.career ?? "Intern"}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[12px] text-steel">Monthly salary</p>
              <p className="t-num text-[18px] font-semibold text-ink">
                {formatPaise(data?.career?.salaryPerCycle ?? 0)}
              </p>
            </div>
          </div>

          <p className="mt-3 text-[13px] leading-[1.5] text-steel">
            {data?.career?.blurb ?? "Learning the ropes."}
          </p>

          {/* XP progress toward the next promotion */}
          <div className="mt-5">
            <div className="flex items-baseline justify-between text-[12px]">
              <span className="font-medium text-steel">
                Level <span className="t-num">{data?.career?.level ?? 1}</span>
              </span>
              <span className="t-num text-stone">
                {data?.career?.xp ?? 0} / {data?.career?.next?.xpRequired ?? 0} XP
                {data?.career?.next ? ` → ${data.career.next.title}` : " · top of the ladder"}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-hairline-soft">
              <span
                className="block h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                style={{ width: `${careerProgress}%` }}
              />
            </div>
            {data?.career?.next && (
              <p className="mt-2 text-[12px] text-stone">
                {formatPaise(data.career.next.salaryPerCycle - data.career.salaryPerCycle)} more
                per month at the next tier.
              </p>
            )}
          </div>
        </section>

        <div className="grid gap-4">
          <section className="rounded-xl border border-hairline bg-canvas p-5">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone">
              <Clock size={13} />
              Next payday
            </p>
            <p className="t-num mt-2 text-[24px] font-semibold text-ink">
              {salaryCountdown === null ? "—" : formatDuration(salaryCountdown)}
            </p>
            <p className="mt-1 text-[12px] leading-[1.5] text-steel">
              {data?.salary?.dueCycles > 0
                ? `${data.salary.dueCycles} unpaid month(s) waiting.`
                : `Salary is credited automatically each simulated month (1 real day).`}
            </p>
          </section>

          <section className="rounded-xl border border-hairline bg-canvas p-5">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone">
              <Fire size={13} />
              Daily streak
            </p>
            <p className="t-num mt-2 text-[24px] font-semibold text-ink">
              {data?.streak?.current ?? 0}{" "}
              <span className="text-[14px] font-medium text-steel">
                day{data?.streak?.current === 1 ? "" : "s"}
              </span>
            </p>
            <p className="mt-1 text-[12px] leading-[1.5] text-steel">
              {data?.streak?.bonusPct
                ? `+${data.streak.bonusPct}% on every task you claim today.`
                : "Claim a task today to start a streak."}
            </p>
          </section>
        </div>
      </div>

      {/* Gigs */}
      <section className="mt-4 rounded-xl border border-hairline bg-canvas p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-[18px] font-semibold text-ink">
              <Briefcase size={19} weight="duotone" />
              Freelance work
            </h2>
            <p className="mt-1 text-[13px] leading-[1.5] text-steel">
              Each job has its own cooldown. Do them in order of what is ready.
            </p>
          </div>
          {data?.gigCap && (
            <p className="t-num rounded-full border border-hairline px-3 py-1 text-[12px] font-medium text-steel">
              {data.gigCap.used} / {data.gigCap.max} this month
            </p>
          )}
        </div>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {(data?.gigs ?? []).map((gig) => {
            const busy = busyId === gig.id;
            return (
              <li
                key={gig.id}
                className={`flex items-start gap-3 rounded-xl border p-4 ${
                  gig.ready ? "border-hairline" : "border-hairline-soft bg-surface-soft"
                }`}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface text-charcoal">
                  <CatalogIcon name={gig.icon} size={19} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[15px] font-semibold text-charcoal">{gig.name}</p>
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${
                        DIFFICULTY_TONE[gig.difficulty] ?? DIFFICULTY_TONE.Easy
                      }`}
                    >
                      {gig.difficulty}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] leading-[1.5] text-steel">{gig.blurb}</p>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="t-num text-[16px] font-semibold text-ink">
                      {formatPaise(gig.expectedReward)}
                      <span className="ml-1 text-[11px] font-medium text-steel">
                        +{gig.xp} XP
                      </span>
                    </p>

                    <button
                      type="button"
                      disabled={!gig.ready || busy || Boolean(busyId)}
                      onClick={() => runGig(gig)}
                      className="btn-primary focus-ring inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium disabled:cursor-not-allowed disabled:bg-hairline disabled:text-muted disabled:shadow-none"
                    >
                      {busy ? (
                        "Working…"
                      ) : gig.ready ? (
                        "Work"
                      ) : (
                        <>
                          <Timer size={13} weight="bold" />
                          <span className="t-num">
                            {formatDuration(msUntil(gig.readyAt, now) ?? 0)}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Daily tasks */}
      <section className="mt-4 rounded-xl border border-hairline bg-canvas p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-[18px] font-semibold text-ink">
              <Trophy size={19} weight="duotone" />
              Daily tasks
            </h2>
            <p className="mt-1 text-[13px] leading-[1.5] text-steel">
              Small payouts, claimed once a day. The streak is what makes them worth it.
            </p>
          </div>
          {data?.taskCap && (
            <p className="t-num rounded-full border border-hairline px-3 py-1 text-[12px] font-medium text-steel">
              {data.taskCap.used} / {data.taskCap.max} today
            </p>
          )}
        </div>

        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {(data?.tasks ?? []).map((task) => {
            const busy = busyId === task.id;
            const done = data.taskCap.used >= data.taskCap.max;
            return (
              <li key={task.id} className="flex flex-col rounded-xl border border-hairline p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface text-charcoal">
                    <CatalogIcon name={task.icon} size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-charcoal">{task.name}</p>
                    <p className="mt-0.5 text-[12px] leading-[1.5] text-steel">{task.blurb}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-hairline-soft pt-3">
                  <p className="t-num text-[14px] font-semibold text-ink">
                    {formatPaise(task.expectedReward)}
                  </p>
                  <button
                    type="button"
                    disabled={done || busy || Boolean(busyId)}
                    onClick={() => runTask(task)}
                    className="btn-ghost focus-ring rounded-lg border border-hairline px-3 py-1.5 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? "Claiming…" : done ? "Done for today" : "Claim"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {!loading && data?.taskCap?.used >= data?.taskCap?.max && (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-surface-soft px-3.5 py-2.5 text-[13px] leading-[1.5] text-steel">
            <WarningCircle size={16} className="mt-0.5 shrink-0" />
            You have claimed all three tasks today. The cap is a real day, not a simulated one —
            come back tomorrow to keep the streak alive.
          </p>
        )}
      </section>

      <ReceiptModal
        open={Boolean(receipt)}
        receipt={receipt}
        title={receipt?.direction === "credit" ? "Money received" : "Receipt"}
        onClose={() => setReceipt(null)}
      />
    </DashboardShell>
  );
}
