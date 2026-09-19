/* ----------------------------------------------------------------------------
   Wealthify service worker.

   The value of a service worker here is not offline-first — this is an app
   whose every screen is a live balance. It is that a cold start stops
   re-downloading the same fonts and the same content-hashed JS on every launch,
   which is most of the difference between "a website in a window" and an app.

   So the caching policy is deliberately narrow, and the rules are in order of
   how much they matter:

   1. **`/api/*` is never cached, and never intercepted at all.** Every response
      under it is somebody's money. A cached balance is worse than no balance:
      it is wrong and it looks authoritative. Requests are left completely alone
      so the browser handles them exactly as if this worker did not exist.

   2. **HTML is never cached either.** Any page under the app shell is
      server-rendered for a specific signed-in user, and dropping that into a
      cache means the next person to open the app on that device can be shown
      the last user's balances from disk. Navigations therefore always go to the
      network, and the only thing that ever comes out of the cache is the
      offline page.

   3. **Only immutable things are cached.** Content-hashed build output under
      `/_next/static/`, the icons, and the app mark. Those URLs change whenever
      their contents do, so a cache hit can never be stale — which is why this
      is a plain cache-first strategy with no revalidation and no expiry logic.

   4. **Everything else is untouched.** No catch-all handler, no runtime caching
      of arbitrary GETs. A worker that caches things it was not asked to cache is
      how a balance sheet ends up in a disk cache.
   -------------------------------------------------------------------------- */

const VERSION = "v1";
const STATIC_CACHE = `wealthify-static-${VERSION}`;
const OFFLINE_URL = "/offline";

/* Precache is small on purpose: the offline page and the icon the offline page
   (and any install prompt) needs. Build output is cached on first use instead,
   because hashed filenames are not knowable at install time. */
const PRECACHE = [
  OFFLINE_URL,
  "/wealthify-mark.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // `addAll` rejects the whole install if any single URL fails, so a
      // mistyped path silently breaks offline support. Add them individually.
      await Promise.all(
        PRECACHE.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {}),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older versions, then take over open tabs so a new
      // worker is live without requiring a second launch.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

/** URL shapes whose contents are immutable by construction. */
function isImmutableAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/icons/") ||
    pathname === "/wealthify-mark.png" ||
    pathname === "/apple-icon.png"
  );
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  // Only store a complete, same-origin success. A 404 or an opaque response in
  // the cache is a bug that outlives the deploy that caused it.
  if (response.ok && response.type === "basic") {
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

async function offlineFallback() {
  const cache = await caches.open(STATIC_CACHE);
  const offline = await cache.match(OFFLINE_URL);
  return offline ?? new Response("Offline", { status: 503 });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Anything that is not a plain GET is a request that changes something, and
  // is none of this worker's business.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Third-party (fonts, and anything else) is left entirely alone.
  if (url.origin !== self.location.origin) return;

  // Rule 1: never touch the API.
  if (url.pathname.startsWith("/api/")) return;

  // Rule 3: immutable build output and icons, cache-first.
  if (isImmutableAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Rule 2: page navigations go to the network, with the offline page as the
  // only fallback. No authed HTML is ever written to a cache.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          return offlineFallback();
        }
      })(),
    );
  }

  // Everything else: no handler, default browser behaviour.
});
