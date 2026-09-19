"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  CheckCircle,
  Clock,
  Fire,
  LockKey,
  Medal,
  Timer,
  TrendUp,
  Trophy,
  WarningCircle,
} from "@phosphor-icons/react";
import DashboardShell from "../../components/dashboard-shell";
import ReceiptModal from "../../components/receipt-modal";
import CheckoutSheet from "../../components/checkout-sheet";
import { CatalogIcon } from "../../components/icon-map";
import { useAuth } from "../../components/auth-provider";
import { useToast } from "../../components/toast-provider";
import { usePaymentFeedback } from "../../components/payment-feedback-provider";
import { useNotices } from "../../lib/use-notices";
import {
  collectCourse,
  completeTask,
  enrolCourse,
  fetchIncome,
  startGig,
  transferAllEarnings,
  transferEarnings,
} from "../../lib/economy";
import { formatDuration, formatPaise, newIdempotencyKey } from "../../lib/api";
import { useNow } from "../../lib/use-now";

/* ----------------------------------------------------------------------------
   Income.

   The loop this page teaches, in order:

     learn a skill  ->  a course you pay for and wait out  ->  better jobs
     do the work    ->  a timer you wait out              ->  escrow
     transfer       ->  the only thing that moves money into your wallet

   Nothing is instant and nothing is free. Two design consequences run through
   the whole page:

   1. **A running job is not money yet.** The wallet does not change when you
      tap Start, and the figure sitting in "Awaiting transfer" is deliberately
      counted separately from the balance in the header. That separation is the
      feature, so it is never collapsed into one number.

   2. **Timers are computed from the clock, not from a response.** Completion
      is `now >= finishesAt`, which the client can evaluate itself, so a card
      flips to "Transfer" the second the timer ends without waiting for a
      round trip — and a single timer is scheduled for the next finish so the
      page picks up its own escrow the moment it exists.

   Cooldowns are gone. A job occupies one of three slots while it runs and is
   otherwise always available, which is a far better pacing device than a
   per-job stopwatch and it makes skill breadth genuinely valuable: more skills
   means shorter jobs, and shorter jobs means more of them per hour.
   -------------------------------------------------------------------------- */

const DIFFICULTY_TONE = {
  Easy: "border-hairline text-steel",
  Medium: "border-[color-mix(in_srgb,var(--link-blue)_35%,white)] text-link",
  Hard: "border-[color-mix(in_srgb,var(--brand-orange)_40%,white)] text-[var(--brand-orange)]",
  Premium: "border-[color-mix(in_srgb,var(--primary)_45%,white)] text-primary",
};

/* Level pips. Filled ones are the levels held; the rest are the ladder still
   to climb, which is what makes the price of the next course legible. */
function SkillPips({ level, max }) {
  return (
    <span className="flex items-center gap-1" aria-label={`Level ${level} of ${max}`}>
      {Array.from({ length: max }, (_, index) => (
        <span
          key={index}
          className={`h-1.5 rounded-full transition-colors ${
            index < level ? "w-4 bg-primary" : "w-4 bg-hairline-soft"
          }`}
        />
      ))}
    </span>
  );
}

function ProgressBar({ value, tone = "bg-primary" }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-hairline-soft">
      <span
        className={`block h-full rounded-full ${tone} transition-[width] duration-500 ease-out`}
        style={{ width: `${Math.min(100, Math.round(value * 100))}%` }}
      />
    </div>
  );
}

export default function IncomePage() {
  const router = useRouter();
  const { status, user, wallet, applyWallet, applyUser, refresh } = useAuth();
  const toast = useToast();
  const feedback = usePaymentFeedback();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [checkout, setCheckout] = useState(null);

  // One key per in-flight action, kept so a retry after a network drop reuses
  // it and the ledger replays instead of paying twice.
  const keys = useRef(new Map());
  // Last status seen per engagement, so a job finishing can announce itself
  // once rather than on every render after it lands.
  const seen = useRef(new Map());

  const hasPin = user?.hasPaymentPin ?? false;
  const now = useNow();

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

  const keyFor = useCallback((id) => {
    if (!keys.current.has(id)) keys.current.set(id, newIdempotencyKey());
    return keys.current.get(id);
  }, []);

  /* --- The next finish ----------------------------------------------------
     One timer for the soonest deadline, not one per card. `now` is the only
     clock this component is allowed to read during render (it comes from
     useSyncExternalStore, so it is a store value rather than an impure call),
     and filtering out deadlines that have already passed is what stops the
     schedule from hammering the API once everything has finished.

     The value is stable while every deadline is still in the future, so the
     effect below only re-runs — and only refetches — at an actual deadline. */
  const nextFinishAt = useMemo(() => {
    const times = (data?.engagements ?? [])
      .map((row) => new Date(row.finishesAt).getTime())
      .filter((time) => time > now);
    return times.length ? Math.min(...times) : null;
  }, [data?.engagements, now]);

  useEffect(() => {
    if (!nextFinishAt) return;
    const delay = Math.max(400, nextFinishAt - Date.now() + 700);
    const timer = setTimeout(() => {
      load().catch(() => {});
    }, delay);
    return () => clearTimeout(timer);
  }, [nextFinishAt, load]);

  /* A job that flips from running to ready gets a chime. It is the moment the
     Transfer button appears, so it is worth hearing. */
  useEffect(() => {
    const rows = data?.engagements;
    if (!rows) return;
    let landed = false;
    for (const row of rows) {
      if (seen.current.get(row.id) === "active" && row.status === "ready") landed = true;
      seen.current.set(row.id, row.status);
    }
    if (landed) feedback.play("ready");
  }, [data?.engagements, feedback]);

  const readyGigs = useMemo(
    () => (data?.engagements ?? []).filter((row) => row.kind === "gig" && row.status === "ready"),
    [data?.engagements],
  );
  const runningGigs = useMemo(
    () => (data?.engagements ?? []).filter((row) => row.kind === "gig" && row.status === "active"),
    [data?.engagements],
  );
  const courses = useMemo(
    () => (data?.engagements ?? []).filter((row) => row.kind === "course"),
    [data?.engagements],
  );

  const slotsUsed = runningGigs.length + courses.filter((row) => row.status === "active").length;
  const slotsMax = data?.slots?.max ?? 3;
  const slotsFull = slotsUsed >= slotsMax;

  const careerProgress = useMemo(
    () => Math.round((data?.career?.progressToNext ?? 0) * 100),
    [data],
  );

  /* A countdown that is honest about being local: the server decides what
     finished, this only decides how long to keep drawing a timer. */
  const remaining = (row) => Math.max(0, new Date(row.finishesAt).getTime() - now);
  const localReady = (row) => row.status === "ready" || remaining(row) <= 0;

  /* --- Course checkout ---------------------------------------------------- */
  const selectedCourse = useMemo(
    () => (data?.skills ?? []).map((skill) => skill.course).find((c) => c?.id === checkout) ?? null,
    [data?.skills, checkout],
  );

  const intent = useMemo(() => {
    if (!selectedCourse) return null;
    return {
      key: selectedCourse.id,
      kind: "course",
      title: "Confirm enrolment",
      merchant: "Wealthify Academy",
      icon: selectedCourse.icon,
      amount: selectedCourse.cost,
      items: [
        {
          label: selectedCourse.name,
          note: `${formatDuration(selectedCourse.durationSec * 1000)} of study · +${selectedCourse.xp} XP`,
          amount: selectedCourse.cost,
          icon: selectedCourse.icon,
        },
      ],
    };
  }, [selectedCourse]);

  const execute = useCallback(
    ({ pin, paymentMethod, clientKey }) =>
      enrolCourse({ id: selectedCourse.id, paymentMethod, pin, clientKey }),
    [selectedCourse],
  );

  const onCourseEnrolled = useCallback(
    async (result) => {
      if (result?.receipt?.wallet) applyWallet(result.receipt.wallet, result.clock);
      toast.push({
        tone: "info",
        title: "Enrolled",
        body: `${selectedCourse.name} finishes in ${formatDuration(selectedCourse.durationSec * 1000)}.`,
      });
      await load();
    },
    [applyWallet, toast, selectedCourse, load],
  );

  /* --- Actions ------------------------------------------------------------ */
  async function runStart(gig) {
    setBusy(`start:${gig.id}`);
    try {
      const result = await startGig({ id: gig.id });
      feedback.play("transfer");
      toast.push({
        tone: "info",
        title: result.replay ? "Already on it" : "Job started",
        body: `${gig.name} · ${formatDuration(result.engagement.durationMs)}. Transfer it when it is done.`,
      });
      await load();
    } catch (err) {
      toast.push({
        tone: "warning",
        title: err?.code === "NO_FREE_SLOT" ? "All slots busy" : "Could not start that job",
        body: err?.message ?? "Try again in a moment.",
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function runTransfer(engagement) {
    const key = `transfer:${engagement.id}`;
    setBusy(key);
    try {
      const result = await transferEarnings({ id: engagement.id, clientKey: keyFor(key) });
      keys.current.delete(key);
      if (result.receipt?.wallet) applyWallet(result.receipt.wallet, result.clock);
      feedback.play("credit");
      setReceipt(result.receipt);
      await load();
    } catch (err) {
      keys.current.delete(key);
      toast.push({
        tone: "warning",
        title: "Could not transfer",
        body: err?.message ?? "Try again in a moment.",
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function runTransferAll() {
    const key = "transfer:all";
    setBusy(key);
    try {
      const result = await transferAllEarnings({ clientKey: keyFor(key) });
      keys.current.delete(key);
      if (result.wallet) applyWallet(result.wallet, result.clock);
      feedback.play("credit");
      toast.push({
        tone: "success",
        title: `${formatPaise(result.total)} transferred`,
        body:
          result.transfers.length === 1
            ? `${result.transfers[0].title} is in your wallet.`
            : `${result.transfers.length} payouts moved into your wallet.`,
      });
      await load();
    } catch (err) {
      keys.current.delete(key);
      toast.push({
        tone: "warning",
        title: "Nothing to transfer",
        body: err?.message ?? "Let the timers run.",
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function runCollect(engagement) {
    setBusy(`collect:${engagement.id}`);
    try {
      const result = await collectCourse({ id: engagement.id });
      feedback.play("success");
      const skill = data?.skills?.find((item) => item.id === result.skill.id);
      toast.push({
        tone: "success",
        title: result.replay ? "Already collected" : `${skill?.name ?? "Skill"} Lv${result.skill.to}`,
        body: result.replay
          ? "That level is already yours."
          : `+${result.xp} XP. Level ${result.level} overall.`,
      });
      applyUser({ xp: (user?.xp ?? 0) + (result.xp ?? 0), level: result.level ?? user?.level });
      await load();
      await refresh();
    } catch (err) {
      toast.push({
        tone: "warning",
        title: "Could not collect",
        body: err?.message ?? "Try again in a moment.",
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function runTask(task) {
    setBusy(`task:${task.id}`);
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
      setBusy(null);
    }
  }

  const pendingTotal = data?.pending?.amount ?? 0;
  const board = useMemo(() => {
    // Available first, then jobs you could take with a skill you already hold,
    // then the ones still locked away behind a course.
    const rows = [...(data?.gigs ?? [])];
    return rows.sort((a, b) => {
      const rank = (gig) => (gig.engagement ? 2 : gig.locked ? 3 : 1);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return b.reward - a.reward;
    });
  }, [data?.gigs]);

  return (
    <DashboardShell>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.01em] text-ink sm:text-[32px]">
            Income
          </h1>
          <p className="mt-1 text-sm leading-[1.5] text-steel">
            Take work, wait for it to finish, then transfer what it earned you.
          </p>
        </div>
        <div className="flex flex-wrap items-stretch gap-3">
          {pendingTotal > 0 && (
            <div className="rounded-xl border border-[color-mix(in_srgb,var(--brand-orange)_40%,white)] bg-[color-mix(in_srgb,var(--brand-orange)_7%,white)] px-4 py-3">
              <p className="text-[12px] font-medium text-[var(--brand-orange-deep)]">
                Awaiting transfer
              </p>
              <p className="t-num mt-0.5 text-[20px] font-semibold text-ink">
                {formatPaise(pendingTotal)}
              </p>
            </div>
          )}
          <div className="rounded-xl border border-hairline bg-canvas px-4 py-3">
            <p className="text-[12px] font-medium text-steel">In your wallet</p>
            <p className="t-num mt-0.5 text-[20px] font-semibold text-ink">
              {formatPaise(wallet?.cashBalance ?? 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Awaiting transfer — the money that exists but is not yours yet */}
      {readyGigs.length > 0 && (
        <section className="mt-5 rounded-xl border border-[color-mix(in_srgb,var(--brand-orange)_38%,white)] bg-canvas p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-[18px] font-semibold text-ink">
                <ArrowUpRight size={19} weight="duotone" />
                Awaiting transfer
              </h2>
              <p className="mt-1 text-[13px] leading-[1.5] text-steel">
                {readyGigs.length === 1
                  ? "This job is finished. The client is holding your fee until you transfer it."
                  : `${readyGigs.length} jobs are finished. The client is holding the fees until you transfer them.`}
              </p>
            </div>
            <div className="text-right">
              <p className="t-num text-[26px] font-semibold text-ink">{formatPaise(pendingTotal)}</p>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={runTransferAll}
                className="btn-primary focus-ring mt-2 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowUpRight size={15} weight="bold" />
                {busy === "transfer:all" ? "Transferring…" : "Transfer all"}
              </button>
            </div>
          </div>

          <ul className="mt-4 grid gap-2">
            {readyGigs.map((engagement) => {
              const key = `transfer:${engagement.id}`;
              return (
                <li
                  key={engagement.id}
                  className="flex items-center gap-3 rounded-lg border border-hairline bg-surface-soft px-3.5 py-3"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-canvas text-charcoal">
                    <CatalogIcon name={engagement.icon} size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-charcoal">
                      {engagement.title}
                    </p>
                    <p className="text-[12px] text-steel">
                      Finished · held in escrow
                    </p>
                  </div>
                  <p className="t-num shrink-0 text-[14px] font-semibold text-ink">
                    {formatPaise(engagement.reward)}
                  </p>
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => runTransfer(engagement)}
                    className="btn-primary focus-ring shrink-0 rounded-lg px-3.5 py-2 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === key ? "Transferring…" : "Transfer"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* In progress */}
      {(runningGigs.length > 0 || courses.length > 0) && (
        <section className="mt-4 rounded-xl border border-hairline bg-canvas p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-[18px] font-semibold text-ink">
                <Timer size={19} weight="duotone" />
                In progress
              </h2>
              <p className="mt-1 text-[13px] leading-[1.5] text-steel">
                Work runs while you do something else. Three slots, shared between jobs and courses.
              </p>
            </div>
            <p className="t-num rounded-full border border-hairline px-3 py-1 text-[12px] font-medium text-steel">
              {slotsUsed} / {slotsMax} slots busy
            </p>
          </div>

          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {[...runningGigs, ...courses].map((engagement) => {
              const left = remaining(engagement);
              const done = localReady(engagement);
              const isCourse = engagement.kind === "course";
              const progress = engagement.durationMs
                ? 1 - left / engagement.durationMs
                : 0;
              const collectKey = `collect:${engagement.id}`;
              return (
                <li
                  key={engagement.id}
                  className={`flex flex-col gap-3 rounded-xl border p-4 ${
                    done ? "border-[color-mix(in_srgb,var(--primary)_35%,white)]" : "border-hairline"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface text-charcoal">
                      <CatalogIcon name={engagement.icon} size={19} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-charcoal">
                        {engagement.title}
                      </p>
                      <p className="text-[12px] text-steel">
                        {isCourse ? "Course" : "Freelance"} · {formatDuration(engagement.durationMs)} total
                      </p>
                    </div>
                    {done ? (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-tint-mint px-2.5 py-1 text-[11px] font-semibold text-success">
                        <CheckCircle size={12} weight="fill" />
                        Ready
                      </span>
                    ) : (
                      <span className="t-num shrink-0 text-[15px] font-semibold text-ink">
                        {formatDuration(left)}
                      </span>
                    )}
                  </div>

                  <ProgressBar value={done ? 1 : progress} />

                  <div className="flex items-center justify-between gap-3">
                    <p className="t-num text-[13px] font-medium text-steel">
                      {isCourse ? `+${engagement.xp} XP on completion` : formatPaise(engagement.reward)}
                    </p>
                    {done &&
                      (isCourse ? (
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => runCollect(engagement)}
                          className="btn-primary focus-ring rounded-lg px-3.5 py-2 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {busy === collectKey ? "Collecting…" : "Collect skill"}
                        </button>
                      ) : (
                        <span className="text-[12px] font-medium text-[var(--brand-orange-deep)]">
                          Transfer it above
                        </span>
                      ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Skills */}
      <section className="mt-4 rounded-xl border border-hairline bg-canvas p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-[18px] font-semibold text-ink">
              <TrendUp size={19} weight="duotone" />
              Skills
            </h2>
            <p className="mt-1 text-[13px] leading-[1.5] text-steel">
              Courses cost money and take real time. Every level makes the matching work pay more and
              finish sooner — and every level you hold anywhere shaves a little off everything else.
            </p>
          </div>
          <p className="t-num rounded-full border border-hairline px-3 py-1 text-[12px] font-medium text-steel">
            {data?.totalSkillLevels ?? 0} levels held
          </p>
        </div>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(data?.skills ?? []).map((skill) => {
            const course = skill.course;
            const run = skill.run;
            const courseReady = run ? localReady(run) : false;
            const studying = Boolean(run) && !courseReady;
            const maxed = skill.level >= skill.maxLevel;
            const studyingKey = run ? `collect:${run.id}` : null;

            return (
              <li
                key={skill.id}
                className={`flex flex-col rounded-xl border p-4 ${
                  studying ? "border-hairline-soft bg-surface-soft" : "border-hairline"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface text-charcoal">
                    <CatalogIcon name={skill.icon} size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-charcoal">{skill.name}</p>
                    <p className="t-num mt-0.5 text-[12px] text-steel">
                      Level {skill.level}
                      {maxed ? " · mastered" : ` of ${skill.maxLevel}`}
                    </p>
                  </div>
                </div>

                <div className="mt-2.5">
                  <SkillPips level={skill.level} max={skill.maxLevel} />
                </div>

                <p className="mt-2.5 flex-1 text-[12px] leading-[1.5] text-steel">{skill.blurb}</p>

                {studying ? (
                  <div className="mt-3 border-t border-hairline-soft pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[12px] font-medium text-charcoal">
                        Studying {run.title}
                      </p>
                      <p className="t-num shrink-0 text-[12px] font-semibold text-ink">
                        {formatDuration(remaining(run))}
                      </p>
                    </div>
                    <div className="mt-2">
                      <ProgressBar
                        value={run.durationMs ? 1 - remaining(run) / run.durationMs : 0}
                      />
                    </div>
                  </div>
                ) : courseReady ? (
                  <div className="mt-3 border-t border-hairline-soft pt-3">
                    <p className="text-[12px] leading-[1.5] text-steel">
                      Course finished. Collect the level to unlock its work.
                    </p>
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => runCollect(run)}
                      className="btn-primary focus-ring mt-2.5 w-full rounded-lg px-3.5 py-2 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy === studyingKey ? "Collecting…" : `Collect ${skill.name} Lv${run.level}`}
                    </button>
                  </div>
                ) : maxed ? (
                  <p className="mt-3 border-t border-hairline-soft pt-3 text-[12px] font-medium text-success">
                    Maxed out. Nothing left to learn here.
                  </p>
                ) : course ? (
                  <div className="mt-3 border-t border-hairline-soft pt-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="t-num text-[14px] font-semibold text-ink">
                        {formatPaise(course.cost)}
                      </p>
                      <p className="text-[11px] text-steel">
                        {formatDuration(course.durationSec * 1000)} · +{course.xp} XP
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!course.affordable || slotsFull || Boolean(busy)}
                      onClick={() => setCheckout(course.id)}
                      className="btn-primary focus-ring mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium disabled:cursor-not-allowed disabled:bg-hairline disabled:text-muted disabled:shadow-none"
                    >
                      <LockKey size={14} weight="bold" />
                      Enrol in {course.name}
                    </button>
                    {slotsFull && (
                      <p className="mt-1.5 text-[11px] text-steel">
                        All {slotsMax} slots are busy.
                      </p>
                    )}
                    {!course.affordable && (
                      <p className="t-num mt-1.5 text-[11px] text-steel">
                        {formatPaise(course.shortfall)} short.
                      </p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Freelance board */}
      <section className="mt-4 rounded-xl border border-hairline bg-canvas p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-[18px] font-semibold text-ink">
              <Medal size={19} weight="duotone" />
              Freelance board
            </h2>
            <p className="mt-1 text-[13px] leading-[1.5] text-steel">
              Pay is quoted before you start and held in escrow until you transfer it. Skill raises
              the fee and shortens the job.
            </p>
          </div>
          <p className="t-num rounded-full border border-hairline px-3 py-1 text-[12px] font-medium text-steel">
            {data?.gigCap?.used ?? 0} / {data?.gigCap?.max ?? 0} this month
          </p>
        </div>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {board.map((gig) => {
            const startKey = `start:${gig.id}`;
            const running = gig.engagement;
            const runningReady = running ? localReady(running) : false;
            return (
              <li
                key={gig.id}
                className={`flex items-start gap-3 rounded-xl border p-4 ${
                  gig.locked ? "border-hairline-soft bg-surface-soft" : "border-hairline"
                }`}
              >
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
                    gig.locked ? "bg-surface text-stone" : "bg-surface text-charcoal"
                  }`}
                >
                  <CatalogIcon name={gig.icon} size={19} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p
                      className={`text-[15px] font-semibold ${
                        gig.locked ? "text-steel" : "text-charcoal"
                      }`}
                    >
                      {gig.name}
                    </p>
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${
                        DIFFICULTY_TONE[gig.difficulty] ?? DIFFICULTY_TONE.Easy
                      }`}
                    >
                      {gig.difficulty}
                    </span>
                  </div>

                  <p className="mt-1 text-[12px] leading-[1.5] text-steel">{gig.blurb}</p>

                  {/* What the job needs, and what your own skill does to it */}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-steel">
                    <span className="inline-flex items-center gap-1">
                      <CatalogIcon
                        name={data?.skills?.find((s) => s.id === gig.skillId)?.icon ?? "TrendUp"}
                        size={12}
                      />
                      {gig.skillName} Lv{gig.requiredLevel}
                      {gig.requiredLevel > 0 && (
                        <span className={gig.locked ? "" : "text-success"}>
                          {gig.locked ? ` · you are Lv${gig.level}` : " · met"}
                        </span>
                      )}
                    </span>
                    <span className="t-num inline-flex items-center gap-1">
                      <Clock size={12} />
                      {formatDuration(gig.durationMs)}
                      {gig.durationSavedPct > 0 && (
                        <span className="text-success">−{gig.durationSavedPct}%</span>
                      )}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-hairline-soft pt-3">
                    <p className="t-num text-[16px] font-semibold text-ink">
                      {formatPaise(gig.reward)}
                      <span className="ml-1 text-[11px] font-medium text-steel">+{gig.xp} XP</span>
                    </p>

                    {running ? (
                      <span className="t-num inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1.5 text-[12px] font-medium text-steel">
                        {runningReady ? (
                          <>
                            <CheckCircle size={13} weight="fill" className="text-success" />
                            Ready to transfer
                          </>
                        ) : (
                          <>
                            <Timer size={13} weight="bold" />
                            {formatDuration(remaining(running))}
                          </>
                        )}
                      </span>
                    ) : gig.locked ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[12px] font-medium text-stone">
                        <LockKey size={13} weight="bold" />
                        Needs {gig.skillName} Lv{gig.requiredLevel}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={Boolean(busy) || slotsFull}
                        onClick={() => runStart(gig)}
                        className="btn-primary focus-ring rounded-lg px-3.5 py-2 text-[13px] font-medium disabled:cursor-not-allowed disabled:bg-hairline disabled:text-muted disabled:shadow-none"
                      >
                        {busy === startKey ? "Starting…" : "Start job"}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {slotsFull && (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-surface-soft px-3.5 py-2.5 text-[13px] leading-[1.5] text-steel">
            <WarningCircle size={16} className="mt-0.5 shrink-0" />
            All {slotsMax} slots are busy. Wait for one to finish — finished work does not hold a
            slot open, so transferring it frees you up immediately.
          </p>
        )}
      </section>

      {/* Career + salary + streak */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
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
            <div className="mt-2">
              <ProgressBar value={careerProgress / 100} />
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
              {data?.salary?.nextAt === undefined
                ? "—"
                : formatDuration(Math.max(0, new Date(data.salary.nextAt).getTime() - now))}
            </p>
            <p className="mt-1 text-[12px] leading-[1.5] text-steel">
              {data?.salary?.dueCycles > 0
                ? `${data.salary.dueCycles} unpaid month(s) waiting.`
                : "Salary is credited automatically each simulated month (1 real day)."}
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
            const taskKey = `task:${task.id}`;
            const done = (data?.taskCap?.used ?? 0) >= (data?.taskCap?.max ?? 3);
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
                    disabled={done || Boolean(busy)}
                    onClick={() => runTask(task)}
                    className="btn-ghost focus-ring rounded-lg border border-hairline px-3 py-1.5 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === taskKey ? "Claiming…" : done ? "Done for today" : "Claim"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {!loading && (data?.taskCap?.used ?? 0) >= (data?.taskCap?.max ?? 3) && (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-surface-soft px-3.5 py-2.5 text-[13px] leading-[1.5] text-steel">
            <WarningCircle size={16} className="mt-0.5 shrink-0" />
            You have claimed all three tasks today. The cap is a real day, not a simulated one —
            come back tomorrow to keep the streak alive.
          </p>
        )}
      </section>

      <CheckoutSheet
        key={intent?.key ?? "closed"}
        open={Boolean(checkout)}
        onClose={() => setCheckout(null)}
        intent={intent}
        wallet={wallet}
        hasPin={hasPin}
        onPinCreated={() => refresh()}
        execute={execute}
        onSuccess={onCourseEnrolled}
      />

      <ReceiptModal
        open={Boolean(receipt)}
        receipt={receipt}
        title={receipt?.direction === "credit" ? "Money received" : "Receipt"}
        onClose={() => setReceipt(null)}
      />
    </DashboardShell>
  );
}
