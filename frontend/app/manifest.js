/* ----------------------------------------------------------------------------
   The web app manifest.

   Next serves this at /manifest.webmanifest and links it from every page, so
   the only thing this file has to get right is the handful of fields that
   decide how the installed app behaves.

   Three choices worth naming:

  1. **`display: "standalone"`** — the whole point. Installed, the app has no
     address bar or browser chrome, which is what makes the bottom tab bar read
     as a real tab bar rather than as a website with a menu stuck to the bottom.

  2. **`start_url: "/"`, not "/dashboard"** — the landing page already knows how
     to route: it redirects a signed-in visitor straight to the dashboard and
     shows the pitch to everyone else. Pointing the icon at the dashboard would
     work for a signed-in user and bounce everyone else to a login screen they
     have no account for, which is a bad first launch after installing.

  3. **`theme_color` navy, `background_color` navy** — the theme colour is what
     tints the OS task switcher and the browser toolbar; the background colour is
     what the splash screen is painted with while the app boots. Navy for both
     gives the splash a deliberate look instead of a white flash, and the mark on
     a navy tile is already the icon.

   Icons come in pairs. The `any` set carries the app's rounded-square corner
   for launchers that do not re-mask; the `maskable` set is full-bleed with the
   mark inside the safe zone, so Android can crop it to a circle or a squircle
   without slicing the artwork.
   -------------------------------------------------------------------------- */

export default function manifest() {
  return {
    name: "Wealthify — Your virtual financial life",
    short_name: "Wealthify",
    description:
      "Earn it. Spend it. Invest it. Build it. A financial life simulator with real-feeling transactions and 100% virtual money.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a1530",
    theme_color: "#0a1530",
    lang: "en",
    dir: "ltr",
    categories: ["finance", "games", "education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
