import { NextResponse } from "next/server";

// Next.js 16: `middleware.js` is deprecated in favour of `proxy.js`.
// Same behaviour: this runs before matching routes render.
//
// The cookie here is only a routing hint (present vs absent). Real
// authorization stays server-side: the Express API verifies the JWT on
// every call, and the AuthProvider treats a 401 as logged out. That keeps
// an expired-but-present cookie from redirect-looping.

const AUTH_COOKIE = "wealthify_token";

function isProtected(pathname) {
  return (
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/profile" ||
    pathname.startsWith("/profile/")
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

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/profile/:path*"],
};
