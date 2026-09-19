import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Offline — Wealthify",
  description: "Wealthify needs a connection to show your balances.",
};

/* ----------------------------------------------------------------------------
   The offline page.

   The service worker's only navigation fallback, and it is deliberately dull:
   no balances, no cached figures, nothing that could be mistaken for live data
   on a screen that cannot reach the server. The honest answer to "what is my
   net worth right now" with no connection is that we do not know.

   Statically rendered, so it is inlined into the precache at install time and
   comes back instantly even on a dead connection.
   -------------------------------------------------------------------------- */

export default function OfflinePage() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-canvas px-6">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-navy">
          <Image
            src="/wealthify-mark.png"
            alt=""
            width={114}
            height={144}
            className="h-8 w-auto"
          />
        </span>

        <h1 className="mt-6 text-[24px] font-semibold tracking-[-0.01em] text-ink">
          You are offline
        </h1>
        <p className="mt-3 text-[15px] leading-[1.6] text-steel">
          Wealthify keeps every balance on the server rather than on this device,
          so there is nothing to show until the connection is back. Your account
          has not gone anywhere.
        </p>

        <div className="mt-7 grid gap-2">
          {/* A plain link, not a router push: a client-side navigation cannot
              succeed while the network is down, and it would fail silently. */}
          <Link
            href="/"
            className="btn-primary focus-ring rounded-lg px-4 py-3 text-sm font-medium"
          >
            Try again
          </Link>
          <p className="text-[13px] text-stone">
            Reconnect to Wi-Fi or mobile data, then tap above.
          </p>
        </div>
      </div>
    </main>
  );
}
