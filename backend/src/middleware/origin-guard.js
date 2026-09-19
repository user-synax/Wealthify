import { config } from "../config.js";

/* ----------------------------------------------------------------------------
   Origin guard — defence in depth for the cookie-based session.

  CORS only answers the app's own origin, and the cookie's production
  SameSite=None setting allows the separately hosted frontend to call the API.
  The origin check below is therefore the server-owned CSRF defence.

   This adds one the server owns. Every state-changing request that arrives with
   an `Origin` header must have come from an origin we allow, checked before the
   route runs.

   Why a missing Origin is allowed: non-browser clients (curl, a health check,
   server-to-server) send no Origin at all, and rejecting those would break the
   API for its actual consumers while stopping nobody — an attacker's browser
   always sends one on a cross-site request. This is the standard trade-off, and
   it is why the check is a second layer rather than the only one.

   `GET`/`HEAD`/`OPTIONS` are exempt: they must not change state, and blocking
   them would break plain navigation.
   -------------------------------------------------------------------------- */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const ALLOWED = new Set(
  [
    config.frontendUrl,
    ...(process.env.ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()),
  ]
    .filter(Boolean)
    .map((value) => value.replace(/\/$/, "")),
);

export function originGuard(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get("origin");
  // No Origin at all: a non-browser client. Allowed, see the note above.
  if (!origin) return next();

  if (ALLOWED.has(origin.replace(/\/$/, ""))) return next();

  return res.status(403).json({
    error: {
      code: "ORIGIN_REJECTED",
      message: "This request did not come from the Wealthify app.",
    },
  });
}
