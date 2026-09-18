import Image from "next/image";
import Link from "next/link";
import { Briefcase, Receipt, TrendUp } from "@phosphor-icons/react";

const PANEL_POINTS = [
  {
    icon: <Briefcase size={20} weight="duotone" />,
    title: "Earn a salary and gigs",
    body: "Climb from Intern to Executive, or pick up freelance work.",
  },
  {
    icon: <Receipt size={20} weight="duotone" />,
    title: "Every rupee tracked",
    body: "Rent, groceries, savings and investments, all receipted.",
  },
  {
    icon: <TrendUp size={20} weight="duotone" />,
    title: "Invest in moving markets",
    body: "Buy simulated stocks, watch P&L, build net worth.",
  },
];

function BrandLockup({ dark }) {
  return (
    <Link
      href="/"
      className="focus-ring inline-flex items-center gap-2.5 rounded-lg"
      aria-label="Wealthify home"
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
          dark ? "bg-white/10" : "bg-navy"
        }`}
      >
        <Image
          src="/wealthify-mark.png"
          alt=""
          width={114}
          height={144}
          className="h-[22px] w-auto"
        />
      </span>
      <span
        className={`text-[17px] font-semibold tracking-[-0.02em] ${
          dark ? "text-on-dark" : "text-charcoal"
        }`}
      >
        Wealthify
      </span>
    </Link>
  );
}

// Split-screen auth layout: navy brand panel on desktop, compact navy strip
// on mobile, form on a soft surface so the page is not white-on-white.
export default function AuthCard({ title, subtitle, children }) {
  return (
    <main className="grid min-h-[100dvh] lg:grid-cols-[5fr_6fr]">
      {/* Brand panel: desktop only */}
      <section className="relative hidden overflow-hidden bg-navy text-on-dark lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-12">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-[12%] top-[18%] h-3 w-3 rounded-full bg-[var(--brand-pink)]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-[14%] top-[30%] h-2 w-2 rounded-full bg-[var(--brand-yellow)]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[24%] left-[46%] h-2.5 w-2.5 rounded-full bg-[var(--brand-teal)]"
        />

        <div className="relative">
          <BrandLockup dark />
        </div>

        <div className="relative max-w-md">
          <h2 className="text-balance text-[36px] font-semibold leading-[1.1] tracking-[-0.02em]">
            Earn it. Spend it. Invest it. Build it.
          </h2>
          <p className="mt-4 text-[16px] leading-[1.55] text-on-dark-muted">
            Part banking app, part life sim, part investing game. All with
            virtual money.
          </p>

          <ul className="mt-8 grid gap-5">
            {PANEL_POINTS.map((point) => (
              <li key={point.title} className="flex gap-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/10 text-on-dark">
                  {point.icon}
                </span>
                <span>
                  <span className="block text-[15px] font-semibold">
                    {point.title}
                  </span>
                  <span className="mt-0.5 block text-sm leading-[1.5] text-on-dark-muted">
                    {point.body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[13px] leading-[1.5] text-on-dark-muted">
          Virtual money only. No deposits, no bank details, no real risk.
        </p>
      </section>

      {/* Form side */}
      <section className="flex flex-col bg-surface">
        {/* Compact brand strip: mobile only */}
        <div className="flex items-center justify-between bg-navy px-6 py-4 lg:hidden">
          <BrandLockup dark />
          <Link
            href="/"
            className="focus-ring rounded-lg px-3 py-2 text-sm font-medium text-on-dark"
          >
            Home
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:py-14">
          <div className="w-full max-w-md rounded-xl border border-hairline bg-canvas p-6 shadow-[rgba(15,15,15,0.08)_0px_4px_12px_0px] sm:p-8">
            <div className="flex items-center justify-between">
              <BrandLockup />
              <Link
                href="/"
                className="btn-ghost focus-ring hidden rounded-lg px-3 py-2 text-sm font-medium sm:inline-flex"
              >
                Home
              </Link>
            </div>
            <h1 className="mt-5 text-[28px] font-semibold leading-[1.25] tracking-[-0.01em] text-ink">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 text-sm leading-[1.5] text-steel">{subtitle}</p>
            ) : null}
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </section>
    </main>
  );
}
