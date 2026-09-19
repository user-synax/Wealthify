"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Briefcase,
  House,
  List,
  Receipt,
  SignOut,
  Storefront,
  TrendUp,
  User,
  X,
} from "@phosphor-icons/react";
import { useAuth } from "./auth-provider";
import { useWorkNotifier } from "./work-notifier-provider";

const MAIN_LINKS = [
  { href: "/dashboard", label: "Overview", icon: <House size={20} /> },
  { href: "/income", label: "Income", icon: <Briefcase size={20} /> },
  { href: "/expenses", label: "Expenses", icon: <Receipt size={20} /> },
  { href: "/store", label: "Store", icon: <Storefront size={20} /> },
  { href: "/activity", label: "Activity", icon: <List size={20} /> },
];

const ACCOUNT_LINKS = [{ href: "/profile", label: "Profile", icon: <User size={20} /> }];

// Real destinations that do not exist yet. Rendered as inert rows with a
// Soon badge so the sidebar never promises a page it cannot open.
const SOON_LINKS = [{ label: "Markets", icon: <TrendUp size={20} /> }];

function isActive(pathname, href) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/* transitions-dev #03 — Notification badge.

   Anchored to the nav icon rather than the row, so the dot can pop in without
   the row reflowing. The old inline count pushed the label sideways as it
   appeared, which read as the sidebar twitching every time a bill came due. */
function NavBadge({ count }) {
  const open = typeof count === "number" && count > 0;
  return (
    <span className="t-badge" data-open={open ? "true" : "false"}>
      <span className="t-badge-dot t-num grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--brand-orange)] px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-canvas">
        {open ? count : ""}
      </span>
    </span>
  );
}

function SidebarBody({ onNavigate, badges }) {
  // usePathname() is null during static prerender; fall back to "" so the
  // active-state check never throws before hydration.
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { user, logout } = useAuth();

  async function onLogout() {
    await logout();
    onNavigate?.();
    router.push("/login");
  }

  return (
    <div className="flex h-full flex-col">
      <Link
        href="/"
        onClick={onNavigate}
        className="focus-ring flex items-center gap-2.5 rounded-lg px-2 py-1"
        aria-label="Wealthify home"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-navy">
          <Image
            src="/wealthify-mark.png"
            alt=""
            width={114}
            height={144}
            className="h-[22px] w-auto"
          />
        </span>
        <span className="text-[17px] font-semibold tracking-[-0.02em] text-charcoal">
          Wealthify
        </span>
      </Link>

      <nav aria-label="Dashboard" className="mt-6 grid gap-1">
        {MAIN_LINKS.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`focus-ring flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-surface text-ink"
                  : "text-steel hover:bg-surface hover:text-charcoal"
              }`}
            >
              <span className="relative shrink-0">
                {link.icon}
                <NavBadge count={badges[link.href]} />
              </span>
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 grid gap-1 border-t border-hairline pt-4">
        {ACCOUNT_LINKS.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`focus-ring flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-surface text-ink"
                  : "text-steel hover:bg-surface hover:text-charcoal"
              }`}
            >
              {link.icon}
              {link.label}
            </Link>
          );
        })}
      </div>

      <p className="mt-6 px-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone">
        Coming soon
      </p>
      <div className="mt-2 grid gap-1">
        {SOON_LINKS.map((link) => (
          <span
            key={link.label}
            aria-disabled="true"
            className="flex cursor-not-allowed items-center justify-between rounded-lg px-3.5 py-2.5 text-sm font-medium text-muted"
          >
            <span className="flex items-center gap-3">
              {link.icon}
              {link.label}
            </span>
            <span className="rounded-full border border-hairline px-2 py-0.5 text-[11px] font-semibold text-stone">
              Soon
            </span>
          </span>
        ))}
      </div>

      <div className="mt-auto border-t border-hairline pt-4">
        <div className="flex items-center gap-3 px-2">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy text-sm font-semibold text-on-dark"
          >
            {(user?.username ?? "?").slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-charcoal">
              {user?.username ?? "Loading…"}
            </span>
            <span className="block truncate text-[13px] text-steel">
              {user ? `${user.career} · Level ${user.level}` : " "}
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="btn-ghost focus-ring mt-3 flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium"
        >
          <SignOut size={20} />
          Log out
        </button>
      </div>
    </div>
  );
}

export default function DashboardShell({ children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const panelRef = useRef(null);
  const { status, bills, refreshWallet } = useAuth();
  const { readyCount } = useWorkNotifier();

  /* One map rather than a prop per destination: the badge is the same object
     whatever it counts, and a second badge on a third nav item should not mean
     a third prop. */
  const badges = { "/expenses": bills?.dueCount, "/income": readyCount };

  /* One sync per shell mount. This is what keeps the simulated clock moving
     and the due-bill badge honest whichever signed-in page the user lands on,
     without every page having to remember to do it. */
  useEffect(() => {
    if (status !== "authenticated") return;
    refreshWallet();
  }, [status, refreshWallet]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  return (
    <div className="min-h-[100dvh] bg-surface lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-hairline bg-canvas px-4 py-5 lg:block">
        <SidebarBody badges={badges} />
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center gap-2 border-b border-hairline bg-canvas px-4 py-3 lg:hidden">
        <button
          type="button"
          aria-label={drawerOpen ? "Close menu" : "Open menu"}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((open) => !open)}
          className="nav-item focus-ring grid h-10 w-10 place-items-center rounded-lg"
        >
          {drawerOpen ? <X size={20} weight="bold" /> : <List size={20} weight="bold" />}
        </button>
        <Link href="/" className="focus-ring flex items-center gap-2 rounded-lg" aria-label="Wealthify home">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-navy">
            <Image
              src="/wealthify-mark.png"
              alt=""
              width={114}
              height={144}
              className="h-[20px] w-auto"
            />
          </span>
          <span className="text-[16px] font-semibold tracking-[-0.02em] text-charcoal">
            Wealthify
          </span>
        </Link>
      </div>

      {/* Mobile drawer */}
      <div
        aria-hidden="true"
        onClick={() => setDrawerOpen(false)}
        className={`fixed inset-0 z-40 bg-ink/40 transition-opacity lg:hidden ${
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        ref={panelRef}
        inert={!drawerOpen}
        className={`t-drawer fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-hairline bg-canvas px-4 py-5 lg:hidden ${
          drawerOpen ? "is-open" : ""
        }`}
      >
        <SidebarBody badges={badges} onNavigate={() => setDrawerOpen(false)} />
      </div>

      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
