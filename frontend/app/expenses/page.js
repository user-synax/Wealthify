"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarBlank,
  CaretDown,
  CheckCircle,
  Repeat,
  WarningCircle,
} from "@phosphor-icons/react";
import DashboardShell from "../../components/dashboard-shell";
import CheckoutSheet from "../../components/checkout-sheet";
import Toggle from "../../components/toggle";
import { CatalogIcon } from "../../components/icon-map";
import { useAuth } from "../../components/auth-provider";
import { useToast } from "../../components/toast-provider";
import { useNotices } from "../../lib/use-notices";
import { fetchExpenses, payBill, setAutopay } from "../../lib/economy";
import { formatDuration, formatPaise } from "../../lib/api";
import { msUntil, useNow } from "../../lib/use-now";

/* ----------------------------------------------------------------------------
   Recurring expenses.

   The amount on the Pay button comes from the server's own due calculation, so
   the figure the user sees is the figure the ledger will charge — including
   arrears and late fees. Nothing here recomputes a due date, which is why a
   user returning after a gap sees four months of rent as one correct number
   rather than a stale one.

   Autopay is the only field the user can change. A bill's amount is the
   simulator's business; whether it is collected automatically is a preference.
   -------------------------------------------------------------------------- */

function BillRow({ bill, cycle, onPay, onAutopay, autopayBusy, paying }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li
      className={`rounded-xl border p-4 ${
        bill.due
          ? bill.overdue
            ? "border-[color-mix(in_srgb,var(--semantic-error)_28%,white)]"
            : "border-hairline"
          : "border-hairline-soft bg-surface-soft"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
            bill.due ? "bg-surface text-charcoal" : "bg-canvas text-stone"
          }`}
        >
          <CatalogIcon name={bill.icon} size={19} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-semibold text-charcoal">{bill.name}</p>
            {bill.overdue && (
              <span className="rounded border border-[color-mix(in_srgb,var(--semantic-error)_40%,white)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--semantic-error)]">
                {bill.pending} months behind
              </span>
            )}
            {!bill.due && (
              <span className="rounded border border-hairline px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-success">
                Paid
              </span>
            )}
            {bill.source === "purchase" && (
              <span className="rounded border border-hairline px-1.5 py-0.5 text-[10px] font-semibold text-steel">
                From a purchase
              </span>
            )}
          </div>

          <p className="mt-1 text-[12px] leading-[1.5] text-steel">
            {bill.categoryLabel} · {formatPaise(bill.amount)}/month
            {bill.due && bill.pending > 1 ? ` · ${bill.pending} cycles unpaid` : ""}
          </p>

          {bill.autopayFailed && bill.due && (
            <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-[1.5] text-[var(--brand-orange)]">
              <WarningCircle size={14} weight="fill" className="mt-0.5 shrink-0" />
              Autopay could not collect this one — the balance was short. Pay it manually or the
              fee keeps growing.
            </p>
          )}
        </div>

        <div className="shrink-0 text-right">
          {bill.due ? (
            <>
              <p className="t-num text-[17px] font-semibold text-ink">
                {formatPaise(bill.total)}
              </p>
              {bill.lateFee > 0 && (
                <p className="t-num text-[11px] text-[var(--semantic-error)]">
                  incl. {formatPaise(bill.lateFee)} fee
                </p>
              )}
            </>
          ) : (
            <p className="text-[12px] font-medium text-success">Settled</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-hairline-soft pt-3">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="focus-ring inline-flex items-center gap-1.5 rounded-md text-[12px] font-medium text-steel hover:text-charcoal"
        >
          <CaretDown
            size={12}
            weight="bold"
            className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          />
          {expanded ? "Hide details" : "Details"}
        </button>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2.5">
            <span className="text-[12px] font-medium text-steel">Autopay</span>
            <Toggle
              id={`autopay-${bill.id}`}
              label={`Autopay ${bill.name}`}
              checked={bill.autopay}
              busy={autopayBusy}
              onChange={(next) => onAutopay(bill, next)}
            />
          </label>

          {bill.due && (
            <button
              type="button"
              disabled={paying}
              onClick={() => onPay(bill)}
              className="btn-primary focus-ring rounded-lg px-4 py-2 text-[13px] font-medium disabled:opacity-50"
            >
              {paying ? "Paying…" : `Pay ${formatPaise(bill.total)}`}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <dl className="mt-3 grid gap-1.5 rounded-lg bg-surface-soft px-3.5 py-3 text-[12px]">
          <div className="flex justify-between">
            <dt className="text-steel">Cycle</dt>
            <dd className="t-num text-charcoal">{cycle}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-steel">Unpaid cycles</dt>
            <dd className="t-num text-charcoal">{bill.pending}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-steel">Base ({formatPaise(bill.amount)} × {bill.pending})</dt>
            <dd className="t-num text-charcoal">{formatPaise(bill.base)}</dd>
          </div>
          {bill.lateFee > 0 && (
            <div className="flex justify-between">
              <dt className="text-steel">
                Late fee ({bill.lateFeePct}% × {bill.overdueCycles})
              </dt>
              <dd className="t-num text-[var(--semantic-error)]">{formatPaise(bill.lateFee)}</dd>
            </div>
          )}
          {bill.note && <dd className="mt-1 text-stone">{bill.note}</dd>}
        </dl>
      )}
    </li>
  );
}

export default function ExpensesPage() {
  const router = useRouter();
  const { status, user, wallet, applyWallet, refresh } = useAuth();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkout, setCheckout] = useState(null);
  const [autopayBusy, setAutopayBusy] = useState(null);

  const hasPin = user?.hasPaymentPin ?? false;
  const now = useNow();

  const load = useCallback(async () => {
    try {
      const result = await fetchExpenses();
      setData(result);
      applyWallet(result.wallet, result.clock);
      return result;
    } catch (err) {
      if (err?.status === 401) router.push("/login?next=/expenses");
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
      router.push("/login?next=/expenses");
      return;
    }
    if (status !== "authenticated") return;

    let cancelled = false;
    fetchExpenses()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        applyWallet(result.wallet, result.clock);
      })
      .catch((err) => {
        if (!cancelled && err?.status === 401) router.push("/login?next=/expenses");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status, router, applyWallet]);

  useNotices(data?.notices);

  const selected = useMemo(
    () => data?.bills?.find((bill) => bill.id === checkout?.billId) ?? null,
    [data, checkout],
  );

  const due = useMemo(() => (data?.bills ?? []).filter((bill) => bill.due), [data]);
  const settled = useMemo(() => (data?.bills ?? []).filter((bill) => !bill.due), [data]);

  const intent = useMemo(() => {
    if (!selected) return null;
    return {
      key: `${selected.id}:${selected.pending}`,
      kind: "bill",
      title: `Pay ${selected.name}`,
      merchant: selected.name,
      icon: selected.icon,
      amount: selected.total,
      items: [
        {
          label: `${selected.name} × ${selected.pending}`,
          note: `${formatPaise(selected.amount)} per month`,
          amount: selected.base,
          icon: selected.icon,
        },
        ...(selected.lateFee
          ? [
              {
                label: "Late fee",
                note: `${selected.lateFeePct}% on the overdue month(s)`,
                amount: selected.lateFee,
                icon: "WarningCircle",
              },
            ]
          : []),
      ],
    };
  }, [selected]);

  const execute = useCallback(
    ({ pin, paymentMethod, clientKey }) =>
      payBill({ id: selected.id, paymentMethod, pin, clientKey }),
    [selected],
  );

  const onSuccess = useCallback(
    async (result) => {
      if (result?.receipt?.wallet) applyWallet(result.receipt.wallet, result.clock);
      await load();
      await refresh();
    },
    [applyWallet, load, refresh],
  );

  async function toggleAutopay(bill, next) {
    setAutopayBusy(bill.id);
    // Optimistic: the switch is a preference, and the server response is the
    // source of truth on the next load either way.
    setData((current) => ({
      ...current,
      bills: current.bills.map((row) => (row.id === bill.id ? { ...row, autopay: next } : row)),
    }));
    try {
      await setAutopay({ id: bill.id, autopay: next });
      toast.push({
        tone: next ? "info" : "warning",
        title: next ? `Autopay on for ${bill.name}` : `Autopay off for ${bill.name}`,
        body: next
          ? "It will be collected automatically each simulated month, as long as the balance covers it."
          : "You will need to pay this one yourself each month.",
      });
      await load();
    } catch (err) {
      toast.push({
        tone: "warning",
        title: "Could not change autopay",
        body: err?.message ?? "Try again in a moment.",
      });
      await load();
    } finally {
      setAutopayBusy(null);
    }
  }

  return (
    <DashboardShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.01em] text-ink sm:text-[32px]">
            Expenses
          </h1>
          <p className="mt-1 text-sm leading-[1.5] text-steel">
            Everything that comes round again. Late payments accrue a fee, so order matters.
          </p>
        </div>

        {data?.clock && (
          <div className="flex items-center gap-2.5 rounded-xl border border-hairline bg-canvas px-4 py-3">
            <CalendarBlank size={18} className="text-steel" />
            <div>
              <p className="text-[12px] font-medium text-steel">
                Simulated month {data.clock.cycle}
              </p>
              <p className="text-[13px] font-semibold text-charcoal">
                {data.clock.label} · next in{" "}
                <span className="t-num">
                  {formatDuration(msUntil(data.clock.nextCycleAt, now) ?? 0)}
                </span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Summary */}
      {data?.summary && (
        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-hairline bg-canvas p-4">
            <p className="text-[12px] font-medium text-steel">Due now</p>
            <p className="t-num mt-1 text-[22px] font-semibold text-ink">
              {formatPaise(data.summary.dueTotal)}
            </p>
            <p className="mt-0.5 text-[12px] text-steel">
              {data.summary.dueCount} bill{data.summary.dueCount === 1 ? "" : "s"}
              {data.summary.overdueCount > 0 && (
                <span className="text-[var(--semantic-error)]">
                  {" "}
                  · {data.summary.overdueCount} overdue
                </span>
              )}
            </p>
          </div>

          <div className="rounded-xl border border-hairline bg-canvas p-4">
            <p className="text-[12px] font-medium text-steel">Monthly commitment</p>
            <p className="t-num mt-1 text-[22px] font-semibold text-ink">
              {formatPaise(data.summary.monthlyTotal)}
            </p>
            <p className="mt-0.5 text-[12px] text-steel">
              {data.bills.length} line{data.bills.length === 1 ? "" : "s"} on the account
            </p>
          </div>

          <div className="rounded-xl border border-hairline bg-canvas p-4">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-steel">
              <Repeat size={12} weight="bold" />
              On autopay
            </p>
            <p className="t-num mt-1 text-[22px] font-semibold text-ink">
              {data.summary.autopayCount}
            </p>
            <p className="mt-0.5 text-[12px] text-steel">
              {data.summary.autopayCount ? "Collected automatically" : "Nothing is automatic yet"}
            </p>
          </div>

          <div
            className={`rounded-xl border p-4 ${
              data.summary.lateFees > 0
                ? "border-[color-mix(in_srgb,var(--semantic-error)_28%,white)] bg-canvas"
                : "border-hairline bg-canvas"
            }`}
          >
            <p className="text-[12px] font-medium text-steel">Late fees accrued</p>
            <p
              className={`t-num mt-1 text-[22px] font-semibold ${
                data.summary.lateFees > 0 ? "text-[var(--semantic-error)]" : "text-ink"
              }`}
            >
              {formatPaise(data.summary.lateFees)}
            </p>
            <p className="mt-0.5 text-[12px] text-steel">
              {data.summary.lateFees > 0 ? "Paying earlier avoids this" : "Nothing overdue. Good."}
            </p>
          </div>
        </section>
      )}

      {/* Bills */}
      <section className="mt-4 rounded-xl border border-hairline bg-canvas p-5">
        <h2 className="text-[18px] font-semibold text-ink">Due this month</h2>
        <p className="mt-1 text-[13px] leading-[1.5] text-steel">
          Paying a bill clears every unpaid month for it, including arrears.
        </p>

        {loading ? (
          <div className="mt-4 grid gap-3">
            <div className="t-skel h-28 rounded-xl" />
            <div className="t-skel h-28 rounded-xl" />
            <div className="t-skel h-28 rounded-xl" />
          </div>
        ) : due.length === 0 ? (
          <p className="mt-4 flex items-center gap-2 rounded-xl bg-surface-soft px-4 py-5 text-sm text-charcoal">
            <CheckCircle size={18} weight="fill" className="text-success" />
            Nothing is due. Every bill on the account is settled for {data?.clock?.label}.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {due.map((bill) => (
              <BillRow
                key={bill.id}
                bill={bill}
                cycle={data?.clock?.cycle ?? 0}
                paying={checkout?.billId === bill.id}
                autopayBusy={autopayBusy === bill.id}
                onPay={(row) => setCheckout({ billId: row.id })}
                onAutopay={toggleAutopay}
              />
            ))}
          </ul>
        )}
      </section>

      {settled.length > 0 && (
        <section className="mt-4 rounded-xl border border-hairline bg-canvas p-5">
          <h2 className="text-[18px] font-semibold text-ink">Settled</h2>
          <p className="mt-1 text-[13px] leading-[1.5] text-steel">
            These come back around when the simulated month turns over.
          </p>
          <ul className="mt-4 grid gap-3">
            {settled.map((bill) => (
              <BillRow
                key={bill.id}
                bill={bill}
                cycle={data?.clock?.cycle ?? 0}
                paying={false}
                autopayBusy={autopayBusy === bill.id}
                onPay={() => {}}
                onAutopay={toggleAutopay}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Keyed by the intent so a new bill remounts the sheet with fresh state
          instead of inheriting the previous payment's step and error. */}
      <CheckoutSheet
        key={intent?.key ?? "closed"}
        open={Boolean(checkout)}
        onClose={() => setCheckout(null)}
        intent={intent}
        wallet={wallet}
        hasPin={hasPin}
        onPinCreated={() => refresh()}
        execute={execute}
        onSuccess={onSuccess}
      />
    </DashboardShell>
  );
}
