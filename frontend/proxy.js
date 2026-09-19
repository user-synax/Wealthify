import { NextResponse } from "next/server";

// Next.js 16: `middleware.js` is deprecated in favour of `proxy.js`.
// Same behaviour: this runs before matching routes render.
//
// The API owns the session cookie, so this frontend cannot use cookie presence
// as a routing hint. Real authorization stays server-side: the Express API
// verifies the JWT on every call, and AuthProvider treats a 401 as logged out.

export function proxy(request) {
  // The session cookie is owned by the API origin, so the frontend origin
  // cannot inspect it here. AuthProvider performs the client-side session
  // check, and protected API calls remain server-authorized.
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
