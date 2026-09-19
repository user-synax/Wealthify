"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CaretDown,
  MagnifyingGlass,
  Minus,
  Plus,
  Repeat,
  ShieldCheck,
  Sparkle,
} from "@phosphor-icons/react";
import DashboardShell from "../../components/dashboard-shell";
import SegmentedTabs from "../../components/segmented-tabs";
import CheckoutSheet from "../../components/checkout-sheet";
import { CatalogIcon, RARITY_PILL } from "../../components/icon-map";
import { useAuth } from "../../components/auth-provider";
import { useToast } from "../../components/toast-provider";
import { useNotices } from "../../lib/use-notices";
import { fetchStore, purchase } from "../../lib/economy";
import { formatPaise } from "../../lib/api";

/* ----------------------------------------------------------------------------
   The store.

   Prices and affordability both come from the server, so the shelf can never
   offer something the ledger would decline — the "Buy" button is disabled from
   `product.affordable`, not from a client-side comparison of two numbers the
   client fetched separately.

   The cart is deliberately one item deep. A shopping cart adds steps between
   the user and the payment, and the payment is the point of this product.
   -------------------------------------------------------------------------- */

const SORTS = [
  { id: "featured", label: "Featured" },
  { id: "price-asc", label: "Price: low to high" },
  { id: "price-desc", label: "Price: high to low" },
  { id: "bonus", label: "Biggest reward boost" },
];

function ProductSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-xl border border-hairline bg-canvas p-4">
          <div className="t-skel h-10 w-10 rounded-lg" />
          <div className="t-skel mt-3 h-4 w-3/5 rounded" />
          <div className="t-skel mt-2 h-3 w-full rounded" />
          <div className="t-skel mt-2 h-3 w-4/5 rounded" />
          <div className="t-skel mt-4 h-9 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export default function StorePage() {
  const router = useRouter();
  const { status, user, wallet, applyWallet, refresh } = useAuth();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("featured");
  const [query, setQuery] = useState("");
  // Quantity per sku, because the same shelf can hold a one-off laptop and a
  // grocery run you buy two of in the same session.
  const [quantities, setQuantities] = useState({});
  const [checkout, setCheckout] = useState(null);

  const hasPin = user?.hasPaymentPin ?? false;

  const load = useCallback(async () => {
    try {
      const result = await fetchStore();
      setData(result);
      // The store response runs the economy sync, so it is also the freshest
      // view of the balance — including any salary or autopay that just landed.
      applyWallet(result.wallet, result.clock);
      return result;
    } catch (err) {
      if (err?.status === 401) router.push("/login?next=/store");
      return null;
    } finally {
      setLoading(false);
    }
  }, [router, applyWallet]);

  /* The initial fetch is spelled out rather than delegating to `load`, so every
     state write lands in a promise callback instead of in the effect body.
     Updating state synchronously from an effect cascades a second render before
     the first has been committed, which is what the React rules forbid. */
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?next=/store");
      return;
    }
    if (status !== "authenticated") return;

    let cancelled = false;
    fetchStore()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        applyWallet(result.wallet, result.clock);
      })
      .catch((err) => {
        if (!cancelled && err?.status === 401) router.push("/login?next=/store");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status, router, applyWallet]);

  useNotices(data?.notices);

  const products = useMemo(() => {
    if (!data?.products) return [];
    const needle = query.trim().toLowerCase();
    const rows = data.products.filter((product) => {
      if (category !== "all" && product.category !== category) return false;
      if (!needle) return true;
      return (
        product.name.toLowerCase().includes(needle) ||
        product.blurb.toLowerCase().includes(needle)
      );
    });

    const bonus = (product) => product.effects?.rewardBonusPct ?? 0;
    return rows.sort((a, b) => {
      if (sort === "price-asc") return a.price - b.price;
      if (sort === "price-desc") return b.price - a.price;
      if (sort === "bonus") return bonus(b) - bonus(a);
      // Featured: what you can actually buy first, then the best bonus.
      if (a.affordable !== b.affordable) return a.affordable ? -1 : 1;
      return bonus(b) - bonus(a);
    });
  }, [data, category, query, sort]);

  const tabs = useMemo(
    () =>
      (data?.categories ?? []).map((item) => ({
        id: item.id,
        label: item.label,
        count:
          item.id === "all"
            ? data?.products?.length
            : data?.products?.filter((product) => product.category === item.id).length,
      })),
    [data],
  );

  const selected = useMemo(
    () => data?.products?.find((product) => product.sku === checkout?.sku) ?? null,
    [data, checkout],
  );

  const quantity = selected ? (quantities[selected.sku] ?? 1) : 1;

  function setQuantity(amount) {
    if (!selected) return;
    const next = Math.min(5, Math.max(1, amount));
    setQuantities((current) => ({ ...current, [selected.sku]: next }));
  }

  const intent = useMemo(() => {
    if (!selected) return null;
    const total = selected.price * quantity;
    return {
      key: `${selected.sku}:${quantity}`,
      kind: "purchase",
      title: "Confirm purchase",
      merchant: "Wealthify Store",
      icon: selected.icon,
      amount: total,
      items: [
        {
          label: quantity > 1 ? `${selected.name} × ${quantity}` : selected.name,
          note: `₹${Math.round(selected.price / 100).toLocaleString("en-IN")} each`,
          amount: total,
          icon: selected.icon,
        },
      ],
    };
  }, [selected, quantity]);

  const execute = useCallback(
    ({ pin, paymentMethod, clientKey }) =>
      purchase({ sku: selected.sku, quantity, paymentMethod, pin, clientKey }),
    [selected, quantity],
  );

  /* After a successful charge: adopt the server's wallet, refresh the shelf so
     ownership and affordability are re-derived, and surface anything the
     purchase created (an upkeep bill) or unlocked (a new rarity). */
  const onSuccess = useCallback(
    async (result) => {
      if (result?.receipt?.wallet) applyWallet(result.receipt.wallet, result.clock);
      setQuantities({});

      const unlocked = result?.receipt?.unlockedBill;
      if (unlocked) {
        toast.push({
          tone: "warning",
          title: `${unlocked.name} added to your bills`,
          body: `It costs ${formatPaise(unlocked.amount)} a month from next cycle. It will show up in Expenses.`,
          duration: 9000,
        });
      }
      if (result?.receipt?.leveledUp) {
        toast.push({
          tone: "milestone",
          title: `Level ${result.receipt.level}`,
          body: "Your XP crossed the next threshold.",
        });
      }
      await load();
      await refresh();
    },
    [applyWallet, load, refresh, toast],
  );

  return (
    <DashboardShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.01em] text-ink sm:text-[32px]">
            Store
          </h1>
          <p className="mt-1 text-sm leading-[1.5] text-steel">
            Gear that raises what your work pays. Everything here also costs you something
            recurring, so read the fine print.
          </p>
        </div>

        <div className="rounded-xl border border-hairline bg-canvas px-4 py-3">
          <p className="text-[12px] font-medium text-steel">Available balance</p>
          <p className="t-num mt-0.5 text-[20px] font-semibold text-ink">
            {formatPaise(wallet?.cashBalance ?? 0)}
          </p>
        </div>
      </div>

      {/* Reward-bonus banner: the reason to buy something rather than save it. */}
      {data && (
        <section className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-hairline bg-canvas px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-tint-mint text-success">
              <Sparkle size={18} weight="fill" />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-charcoal">
                Work bonus{" "}
                <span className="t-num text-success">+{data.bonusPct}%</span>
              </p>
              <p className="text-[12px] text-steel">
                Applied to every gig and task payout you earn.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-surface text-charcoal">
              <Repeat size={18} />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-charcoal">Recurring upkeep</p>
              <p className="text-[12px] text-steel">
                Vehicles and rigs add a monthly line to your bills.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-surface text-charcoal">
              <ShieldCheck size={18} weight="fill" />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-charcoal">Balance charged</p>
              <p className="text-[12px] text-steel">
                Paid with your PIN. Order{" "}
                <span className="t-num">
                  {data.clock?.cycle ?? 0}
                </span>{" "}
                · {data.clock?.label}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Filters */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <SegmentedTabs
          tabs={tabs.length ? tabs : [{ id: "all", label: "Everything" }]}
          value={category}
          onChange={setCategory}
          ariaLabel="Product categories"
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
            placeholder="Search the store"
            aria-label="Search the store"
            className="focus-ring h-9 w-full rounded-lg border border-hairline bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-stone"
          />
        </div>

        <div className="relative">
          <label htmlFor="sort" className="sr-only">
            Sort products
          </label>
          <select
            id="sort"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            className="focus-ring h-9 appearance-none rounded-lg border border-hairline bg-surface pl-3 pr-8 text-[13px] text-charcoal"
          >
            {SORTS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <CaretDown
            size={13}
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-stone"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="mt-4">
        {loading ? (
          <ProductSkeleton />
        ) : products.length === 0 ? (
          <p className="rounded-xl border border-hairline bg-canvas px-5 py-10 text-center text-sm text-steel">
            Nothing matches that. Try another category or clear the search.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => {
              const bonus = product.effects?.rewardBonusPct ?? 0;
              return (
                <li
                  key={product.sku}
                  className={`flex flex-col rounded-xl border bg-canvas p-4 ${
                    product.owned ? "border-[color-mix(in_srgb,var(--primary)_30%,white)]" : "border-hairline"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface text-charcoal">
                      <CatalogIcon name={product.icon} size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-charcoal">
                        {product.name}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${
                            RARITY_PILL[product.rarity] ?? RARITY_PILL.common
                          }`}
                        >
                          {product.rarityLabel}
                        </span>
                        {product.owned && (
                          <span className="rounded border border-hairline bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-steel">
                            Owned{product.quantity > 1 ? ` ×${product.quantity}` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="mt-3 flex-1 text-[13px] leading-[1.5] text-steel">{product.blurb}</p>

                  <dl className="mt-3 space-y-1 border-t border-hairline-soft pt-2.5">
                    {bonus > 0 && (
                      <div className="flex items-center justify-between">
                        <dt className="text-[12px] text-steel">Work bonus</dt>
                        <dd className="t-num text-[12px] font-semibold text-success">+{bonus}%</dd>
                      </div>
                    )}
                    {product.addsBill && (
                      <div className="flex items-center justify-between">
                        <dt className="text-[12px] text-steel">{product.addsBill.name}</dt>
                        <dd className="t-num text-[12px] font-semibold text-[var(--brand-orange)]">
                          −{formatPaise(product.addsBill.amount)}/mo
                        </dd>
                      </div>
                    )}
                  </dl>

                  <div className="mt-3.5 flex items-center justify-between gap-3">
                    <p className="t-num text-[16px] font-semibold text-ink">
                      {formatPaise(product.price)}
                    </p>
                    <div className="flex items-center gap-2">
                      {/* Repeat purchases (a second grocery run) get a stepper;
                          one-off assets do not, because nobody buys two sofas
                          to raise their gig rate. */}
                      {product.daily && (
                        <div className="flex items-center rounded-lg border border-hairline">
                          <button
                            type="button"
                            aria-label={`One fewer ${product.name}`}
                            onClick={() =>
                              setQuantities((current) => ({
                                ...current,
                                [product.sku]: Math.max(1, (current[product.sku] ?? 1) - 1),
                              }))
                            }
                            className="focus-ring grid h-8 w-7 place-items-center rounded-l-lg text-steel hover:bg-surface"
                          >
                            <Minus size={12} weight="bold" />
                          </button>
                          <span className="t-num w-5 text-center text-[13px] font-medium text-charcoal">
                            {quantities[product.sku] ?? 1}
                          </span>
                          <button
                            type="button"
                            aria-label={`One more ${product.name}`}
                            onClick={() =>
                              setQuantities((current) => ({
                                ...current,
                                [product.sku]: Math.min(5, (current[product.sku] ?? 1) + 1),
                              }))
                            }
                            className="focus-ring grid h-8 w-7 place-items-center rounded-r-lg text-steel hover:bg-surface"
                          >
                            <Plus size={12} weight="bold" />
                          </button>
                        </div>
                      )}
                      <button
                        type="button"
                        disabled={!product.affordable}
                        onClick={() => setCheckout({ sku: product.sku })}
                        className="btn-primary focus-ring rounded-lg px-3.5 py-2 text-[13px] font-medium disabled:cursor-not-allowed disabled:bg-hairline disabled:text-muted disabled:shadow-none"
                      >
                        {product.affordable ? "Buy" : `Short ${formatPaise(product.shortfall)}`}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Keyed by the intent so a new order remounts the sheet with fresh
          state instead of inheriting the previous payment's step, error and
          idempotency key. */}
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
