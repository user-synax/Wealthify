"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, MagnifyingGlass, Receipt, X } from "@phosphor-icons/react";
import DashboardShell from "../../components/dashboard-shell";
import SegmentedTabs from "../../components/segmented-tabs";
import TransactionRow from "../../components/transaction-row";
import ReceiptModal from "../../components/receipt-modal";
import { useAuth } from "../../components/auth-provider";
import { fetchTransactions } from "../../lib/economy";
import { formatPaise } from "../../lib/api";

/* ----------------------------------------------------------------------------
   Activity — the immutable log, read-only.

   There is no edit and no delete anywhere on this page, because there is no
   edit and no delete anywhere in the ledger. What the feed offers instead is a
   receipt: click any row and the full line items, the method, the reference
   and the balance on either side of the entry come back from the server.

   Paging is cursor-based. The feed grows at the head constantly (autopay, a
   salary, a purchase in another tab), and offset paging would silently skip or
   repeat rows the moment an insert lands above the current window.
   -------------------------------------------------------------------------- */

const TYPE_TABS = [
  { id: "all", label: "Everything" },
  { id: "expense", label: "Spending" },
  { id: "income", label: "Income" },
  { id: "reward", label: "Rewards" },
  { id: "transfer", label: "Savings" },
];

const DIRECTIONS = [
  { id: "all", label: "Both ways" },
  { id: "debit", label: "Out" },
  { id: "credit", label: "In" },
];

const PAGE_SIZE = 20;

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3.5 py-3">
      <div className="t-skel h-10 w-10 rounded-lg" />
      <div className="flex-1">
        <div className="t-skel h-3.5 w-2/5 rounded" />
        <div className="t-skel mt-2 h-3 w-1/4 rounded" />
      </div>
      <div className="t-skel h-4 w-16 rounded" />
    </div>
  );
}

export default function ActivityPage() {
  const router = useRouter();
  const { status } = useAuth();

  const [type, setType] = useState("all");
  const [direction, setDirection] = useState("all");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [openId, setOpenId] = useState(null);
  const requestId = useRef(0);

  /* The loaded page carries the filter signature it was fetched for, so
     "loading" is *derived* from whether the current signature has landed yet.
     The alternative — a `loading` boolean flipped in an effect — writes state
     synchronously while the effect runs, cascading an extra render before the
     first one commits. */
  const filterKey = `${type}|${direction}|${debounced}`;
  const [page, setPage] = useState({ key: null, items: [], totals: { credit: 0, debit: 0 }, cursor: null });
  const loading = page.key !== filterKey;

  // Debounce so a fast typist does not fire one request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  /* Filters are applied by the server, so changing one starts a new page-1
     query rather than filtering a partial list in the browser. */
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?next=/activity");
      return;
    }
    if (status !== "authenticated") return;

    let cancelled = false;
    fetchTransactions({ limit: PAGE_SIZE, type, direction, q: debounced })
      .then((data) => {
        if (cancelled) return;
        setPage({
          key: filterKey,
          items: data.items ?? [],
          totals: data.totals ?? { credit: 0, debit: 0 },
          cursor: data.nextCursor ?? null,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setPage({ key: filterKey, items: [], totals: { credit: 0, debit: 0 }, cursor: null });
      });

    return () => {
      cancelled = true;
    };
  }, [status, router, type, direction, debounced, filterKey]);

  const { items, totals, cursor } = page;

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchTransactions({
        limit: PAGE_SIZE,
        cursor,
        type,
        direction,
        q: debounced,
      });
      setPage((current) => ({
        ...current,
        items: [...current.items, ...(data.items ?? [])],
        totals: {
          credit: current.totals.credit + (data.totals?.credit ?? 0),
          debit: current.totals.debit + (data.totals?.debit ?? 0),
        },
        cursor: data.nextCursor ?? null,
      }));
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, type, direction, debounced]);

  const filtersActive = type !== "all" || direction !== "all" || Boolean(debounced);

  const net = useMemo(() => totals.credit - totals.debit, [totals]);

  return (
    <DashboardShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.01em] text-ink sm:text-[32px]">
            Activity
          </h1>
          <p className="mt-1 text-sm leading-[1.5] text-steel">
            Every entry is written once and never altered. Tap a row for its receipt.
          </p>
        </div>

        {/* Totals describe what is *loaded*, not the account lifetime, so they
            are labelled as such rather than pretending to be a statement. */}
        <div className="flex gap-3">
          <div className="rounded-xl border border-hairline bg-canvas px-4 py-2.5">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-steel">
              <ArrowDownLeft size={12} weight="bold" className="text-success" />
              In
            </p>
            <p className="t-num mt-0.5 text-[16px] font-semibold text-success">
              {formatPaise(totals.credit)}
            </p>
          </div>
          <div className="rounded-xl border border-hairline bg-canvas px-4 py-2.5">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-steel">
              <ArrowUpRight size={12} weight="bold" className="text-charcoal" />
              Out
            </p>
            <p className="t-num mt-0.5 text-[16px] font-semibold text-charcoal">
              {formatPaise(totals.debit)}
            </p>
          </div>
          <div className="rounded-xl border border-hairline bg-surface px-4 py-2.5">
            <p className="text-[12px] font-medium text-steel">Net</p>
            <p
              className={`t-num mt-0.5 text-[16px] font-semibold ${
                net >= 0 ? "text-success" : "text-charcoal"
              }`}
            >
              {net >= 0 ? "+" : "−"}
              {formatPaise(Math.abs(net))}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <SegmentedTabs tabs={TYPE_TABS} value={type} onChange={setType} ariaLabel="Filter by type" />
        <SegmentedTabs
          tabs={DIRECTIONS}
          value={direction}
          onChange={setDirection}
          ariaLabel="Filter by direction"
          size="sm"
        />

        <div className="relative ml-auto min-w-[200px] flex-1 sm:max-w-xs">
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search descriptions"
            aria-label="Search transactions"
            className="focus-ring h-9 w-full rounded-lg border border-hairline bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-stone"
          />
        </div>
      </div>

      {/* Feed */}
      <section className="mt-4 rounded-xl border border-hairline bg-canvas p-2 sm:p-3">
        {loading ? (
          <div className="divide-y divide-hairline-soft">
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-14 text-center">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-surface text-steel">
              <Receipt size={22} />
            </span>
            <p className="mt-3 text-sm font-semibold text-charcoal">
              {filtersActive ? "Nothing matches those filters" : "No activity yet"}
            </p>
            <p className="mt-1 max-w-[38ch] text-sm leading-[1.5] text-steel">
              {filtersActive
                ? "Clear the filters to see the whole ledger."
                : "Work a gig, buy something, or pay a bill and it will appear here immediately."}
            </p>
            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setType("all");
                  setDirection("all");
                  setQuery("");
                }}
                className="btn-ghost focus-ring mt-4 inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3.5 py-2 text-[13px] font-medium"
              >
                <X size={13} weight="bold" />
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <ul className="divide-y divide-hairline-soft">
              {items.map((transaction) => (
                <li key={transaction.id}>
                  <TransactionRow
                    transaction={transaction}
                    onOpen={(row) => setOpenId(row.id)}
                  />
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-center px-3.5 py-4">
              {cursor ? (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="btn-ghost focus-ring rounded-lg border border-hairline px-4 py-2.5 text-[13px] font-medium disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : "Load older entries"}
                </button>
              ) : (
                <p className="text-[12px] text-stone">
                  That is every entry — {items.length} in total.
                </p>
              )}
            </div>
          </>
        )}
      </section>

      <ReceiptModal
        open={Boolean(openId)}
        transactionId={openId}
        onClose={() => setOpenId(null)}
      />
    </DashboardShell>
  );
}
