"use client";

import { useEffect } from "react";

/* ----------------------------------------------------------------------------
   Service worker registration.

   Registered from a client component rather than a script tag in the layout so
   it happens after hydration, on an idle-ish moment, and never blocks the first
   paint of a page whose whole job is to show a balance.

   **Production only, and that is not a shortcut.** A service worker registered
   under `next dev` caches the dev server's build output, and because the dev
   server reuses chunk URLs across edits, the cached copy is a stale module
   graph. The symptom is an app that keeps running last week's code until the
   cache is manually cleared — a confusing hour that buys nothing, since there is
   no offline experience to develop against in dev anyway.

   Failures are swallowed on purpose. An unsupported browser, a blocked
   registration in a private window, or a corporate policy that forbids workers
   all leave a perfectly working app; none of them is worth an error in the
   console that a user might reasonably read as "something is broken".
   -------------------------------------------------------------------------- */

export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    };

    // After `load`, so the worker's own install never competes with the page's
    // first paint for bandwidth on a slow connection.
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
