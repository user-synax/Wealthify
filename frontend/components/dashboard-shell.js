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
} from "@phosphor-icons/react";
import { useAuth } from "./auth-provider";
import { useWorkNotifier } from "./work-notifier-provider";

/* ----------------------------------------------------------------------------
   The application shell.

   Two very different navigations for two very different devices, rather than
   one that folds.

   **Desktop keeps a sidebar.** There is room for it, it holds every destination
   at once, and the account block lives at the bottom where it belongs.

   **Mobile gets a bottom tab bar**, because that is where a thumb already is.
   The drawer it replaces required a reach to the top corner of a tall phone and
   then a second tap, which is two actions for what should be one. Five tabs,
   fixed, always present, with the safe-area inset so the bar sits above the home
   indicator instead of behind it.

   **Labels are shorter on mobile** — Home, Income, Bills, Store, Activity.
   A tab label is read at a glance and at 12px; "Overview" and "Expenses" are
   sidebar words and "Home" and "Bills" are tab words. The two never appear on
   screen at the same time, so this is not an inconsistency anyone can see.

   **The active tab changes icon weight**, not just colour. That is the one
   convention every native tab bar shares — outline when inactive, filled when
   current — and it is legible at a glance in a way a colour change alone is not,
   especially in sunlight.

   The drawer still exists on mobile, now as the "more" sheet behind the avatar:
   profile, the one unbuilt destination, and log out. Secondary things, in a
   secondary place.
   -------------------------------------------------------------------------- */

// Desktop sidebar: the full destination list, long labels.
const MAIN_LINKS = [
  { href: "/dashboard", label: "Overview", icon: House },
  { href: "/income", label: "Income", icon: Briefcase },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/store", label: "Store", icon: Storefront },
  { href: "/activity", label: "Activity", icon: List },
];

// Mobile tab bar: the same five, in tab-label form.
const TABS = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/income", label: "Income", icon: Briefcase, badge: "ready" },
  { href: "/expenses", label: "Bills", icon: Receipt, badge: "due" },
  { href: "/store", label: "Store", icon: Storefront },
  { href: "/activity", label: "Activity", icon: List },
];

const ACCOUNT_LINKS = [{ href: "/profile", label: "Profile", icon: User }];

// Real destinations that do not exist yet. Rendered as inert rows with a
// Soon badge so the menu never promises a page it cannot open.
const SOON_LINKS = [{ label: "Markets", icon: TrendUp }];

// The screen title shown in the mobile header. Native headers name the screen
// you are on; the desktop sidebar does not need to because it shows all of them.
const TITLES = {
  "/dashboard": "Overview",
  "/income": "Income",
  "/expenses": "Expenses",
  "/store": "Store",
  "/activity": "Activity",
  "/profile": "Profile",
};

function isActive(pathname, href) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function titleFor(pathname) {
  const match = Object.keys(TITLES).find((href) => isActive(pathname, href));
  return match ? TITLES[match] : "Wealthify";
}

/* transitions-dev #03 — Notification badge.
   Anchored to the icon rather than the row, so the dot pops in without the row
   reflowing. An inline count pushed the label sideways as it appeared, which
   read as the navigation twitching every time a bill came due. */
function NavBadge({ count, announce = true }) {
  const open = typeof count === "number" && count > 0;
  return (
    <>
      {/* The digit is decoration for the eye. On its own the badge would leave
          the link with no accessible count at all — the digit is `aria-hidden`
          — so it announces one unless its parent already does. The sidebar rows
          have nothing of their own, hence the default; the tab bar carries a
          trailing suffix (so it reads "Bills, 4 waiting" rather than "4 waiting,
          Bills") and opts out, because both at once is announced twice. */}
      <span aria-hidden="true" className="t-badge" data-open={open ? "true" : "false"}>
        <span className="t-badge-dot t-num grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--brand-orange)] px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-canvas">
          {open ? count : ""}
        </span>
      </span>
      {open && announce && <span className="sr-only">{count} waiting</span>}
    </>
  );
}

/**
 * The bottom tab bar.
 *
 * Fixed rather than sticky, so it never participates in the scroll container
 * and cannot be scrolled away. The blur is what keeps it from looking pasted on:
 * content passing underneath stays faintly visible, which is how every native
 * tab bar with a translucent background behaves.
 *
 * `pb-[max(...)]` composes the safe-area inset with the bar's own padding —
 * `env()` returns 0px on a device without a home indicator, so this is one rule
 * for both cases rather than a media query.
 */
function TabBar({ badges }) {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="Primary"
      className="app-chrome safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-canvas/85 backdrop-blur-xl lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          const count =
            tab.badge === "ready"
              ? badges["/income"]
              : tab.badge === "due"
                ? badges["/expenses"]
                : undefined;

          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`focus-ring flex h-[var(--tabbar-h)] flex-col items-center justify-center gap-1 transition-transform duration-100 active:scale-[0.93] ${
                  active ? "text-primary" : "text-steel"
                }`}
              >
                {/* 44px of touch target around a 22px glyph: the minimum a thumb
                    can hit reliably without aiming. */}
                <span className="relative grid h-7 w-9 place-items-center">
                  <Icon size={22} weight={active ? "fill" : "regular"} />
                  <NavBadge count={count} announce={false} />
                </span>
                <span
                  className={`text-[11px] leading-none tracking-[0.01em] ${
                    active ? "font-semibold" : "font-medium"
                  }`}
                >
                  {tab.label}
                </span>
                {/* Gives the tab a spoken count without a visible duplicate. */}
                {count > 0 && <span className="sr-only">{count} waiting</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SidebarBody({ onNavigate, badges, pathname }) {
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
        href="/dashboard"
        onClick={onNavigate}
        className="focus-ring flex items-center gap-2.5 rounded-lg px-2 py-1"
        aria-label="Wealthify overview"
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

      <nav aria-label="All destinations" className="mt-6 grid gap-1">
        {MAIN_LINKS.map((link) => {
          const active = isActive(pathname, link.href);
          const Icon = link.icon;
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
                <Icon size={20} weight={active ? "fill" : "regular"} />
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
          const Icon = link.icon;
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
              <Icon size={20} weight={active ? "fill" : "regular"} />
              {link.label}
            </Link>
          );
        })}
      </div>

      <p className="mt-6 px-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone">
        Coming soon
      </p>
      <div className="mt-2 grid gap-1">
        {SOON_LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <span
              key={link.label}
              aria-disabled="true"
              className="flex cursor-not-allowed items-center justify-between rounded-lg px-3.5 py-2.5 text-sm font-medium text-muted"
            >
              <span className="flex items-center gap-3">
                <Icon size={20} />
                {link.label}
              </span>
              <span className="rounded-full border border-hairline px-2 py-0.5 text-[11px] font-semibold text-stone">
                Soon
              </span>
            </span>
          );
        })}
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
              {user ? `${user.career} · Level ${user.level}` : " "}
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
  const { status, user, bills, refreshWallet } = useAuth();
  const { readyCount } = useWorkNotifier();

  const pathname = usePathname() ?? "";
  /* Starts `true` — "the page's own heading is on screen" — because that is the
     state every page is in the moment it loads: each one renders its own h1 at
     the top. Starting `false` instead would flash the header title for a frame
     on every single navigation before the observer corrected it. */
  const [pageTitleVisible, setPageTitleVisible] = useState(true);

  /* One map rather than a prop per destination: the badge is the same object
     whatever it counts, and a second badge on a third destination should not
     mean a third prop. */
  const badges = { "/expenses": bills?.dueCount, "/income": readyCount };

  /* iOS large-title behaviour, wired once for every page.

     The mobile header owns the screen's name, and so does the page's own h1.
     Showing both at once is the duplication that makes a web app read as a web
     app. Real iOS apps solve it by showing the small title only once the large
     one has scrolled away — which is exactly what this does, by watching the
     page's h1 rather than asking every page to cooperate.

     Observing `main h1` from the shell means a new page gets the behaviour for
     free. The effect re-runs on navigation because the shell outlives the page
     and would otherwise be holding an observer for an element that no longer
     exists. */
  useEffect(() => {
    // A page without its own heading has nothing to duplicate, and the default
    // above already leaves the header quiet, so there is nothing to do here.
    const heading = document.querySelector("main h1");
    if (!heading) return;

    const observer = new IntersectionObserver(
      ([entry]) => setPageTitleVisible(entry.isIntersecting),
      // The header is ~52px tall; treat the title as gone once it is under it.
      { rootMargin: "-56px 0px 0px 0px" },
    );
    observer.observe(heading);
    return () => observer.disconnect();
  }, [pathname]);

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
        <SidebarBody badges={badges} pathname={pathname} />
      </aside>

      {/* Mobile header: the screen's name, not just the brand. `safe-top` keeps
          it clear of the notch once viewport-fit=cover lets the page paint
          underneath it. */}
      <header className="app-chrome safe-top sticky top-0 z-40 border-b border-hairline bg-canvas/90 backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Link
            href="/dashboard"
            className="focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-navy"
            aria-label="Wealthify overview"
          >
            <Image
              src="/wealthify-mark.png"
              alt=""
              width={114}
              height={144}
              priority
              className="h-[20px] w-auto"
            />
          </Link>

          {/* Fades in as the page's own heading scrolls under the header, and
              fades out again on the way back up. Opacity rather than mounting,
              so the header's width never jumps mid-scroll. */}
          <h2
            aria-hidden="true"
            className={`min-w-0 flex-1 truncate text-[17px] font-semibold tracking-[-0.01em] text-ink transition-opacity duration-200 ${
              pageTitleVisible ? "opacity-0" : "opacity-100"
            }`}
          >
            {titleFor(pathname)}
          </h2>
          {/* The screen name still has to exist for assistive tech, which does
              not fade anything in or out. */}
          <span className="sr-only">{titleFor(pathname)}</span>

          <button
            type="button"
            aria-label="Account and more"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
            className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy text-[13px] font-semibold text-on-dark transition-transform duration-100 active:scale-95"
          >
            {(user?.username ?? "?").slice(0, 1).toUpperCase()}
          </button>
        </div>
      </header>

      {/* Mobile "more" sheet. Slides in from the left like the drawer it is, but
          it is now reached from the avatar rather than a hamburger, because the
          five things worth a permanent tap target already live in the tab bar
          and everything left in here is occasional. */}
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
        className={`t-drawer safe-top safe-bottom fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-hairline bg-canvas px-4 py-5 lg:hidden ${
          drawerOpen ? "is-open" : ""
        }`}
      >
        <SidebarBody
          badges={badges}
          pathname={pathname}
          onNavigate={() => setDrawerOpen(false)}
        />
      </div>

      {/* `app-main` reserves the tab bar's height on mobile; see globals.css. */}
      <main className="app-main mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-8">
        {children}
      </main>

      <TabBar badges={badges} />
    </div>
  );
}
