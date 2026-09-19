import { NextResponse } from "next/server";

// Next.js 16: `middleware.js` is deprecated in favour of `proxy.js`.
// Same behaviour: this runs before matching routes render.
//
// The cookie here is only a routing hint (present vs absent). Real
// authorization stays server-side: the Express API verifies the JWT on
// every call, and the AuthProvider treats a 401 as logged out. That keeps
// an expired-but-present cookie from redirect-looping.

const AUTH_COOKIE = "wealthify_token";

// Every signed-in surface. Kept as a list of prefixes so adding a page to the
// sidebar without adding it here cannot silently publish a private route.
const PROTECTED = ["/dashboard", "/profile", "/store", "/activity", "/income", "/expenses"];

// The marketing page. Signed-in visitors are sent the other way — see below.
const LANDING = "/";

function isProtected(pathname) {
  return PROTECTED.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function proxy(request) {
  const { pathname } = request.nextUrl;

  if (isProtected(pathname) && !request.cookies.has(AUTH_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  /* The landing page is for people who do not have an account yet. Someone who
     is already signed in has no use for the pitch, and the alternative — the
     page quietly swapping its "Get started" buttons for "Open dashboard" — is
     a worse answer than simply taking them to the app.

     The redirect happens here rather than in the component so it is a real
     server redirect: no flash of marketing copy, no wasted render, and it works
     with JavaScript disabled. `/login?next=/` still lands on the login page,
     which is what a stale cookie deserves.

     `search = ""` because a query string on `/` (utm tags, a stray ?next) has
     no meaning on the dashboard. */
  if (pathname === LANDING && request.cookies.has(AUTH_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/profile/:path*",
    "/store/:path*",
    "/activity/:path*",
    "/income/:path*",
    "/expenses/:path*",
  ],
};
