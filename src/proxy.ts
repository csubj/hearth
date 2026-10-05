import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Auth-gate proxy (design D6, task 2.3).
 *
 * Runs before every app page request. If the incoming request has no Better
 * Auth session cookie, the request is redirected to `/login?returnTo=<path>`.
 *
 * This is an *optimistic* check — it only looks for the cookie's presence. The
 * real session validation (and ban check) happens server-side in the context
 * helper and oRPC middleware. The proxy provides a fast, early redirect for
 * truly unauthenticated browsers.
 *
 * What is NOT gated here:
 *   - /api/**          — REST routes + auth endpoints (handled by their own logic)
 *   - /login           — sign-in page (must be publicly accessible)
 *   - /_next/**        — Next.js internals + static assets
 *   - /favicon.ico, /sitemap.xml, /robots.txt
 *
 * The matcher below uses a negative lookahead so only app pages pass through
 * this function.
 */

/** Better Auth session cookie names (HTTP dev vs HTTPS prod). */
const SESSION_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
];

export function proxy(request: NextRequest): NextResponse {
  const hasSession = SESSION_COOKIE_NAMES.some((name) =>
    request.cookies.has(name),
  );

  if (hasSession) {
    return NextResponse.next();
  }

  // No session — redirect to the login page, preserving the requested path
  // in `returnTo` so the user is returned after signing in.
  const { pathname, search } = request.nextUrl;
  const returnTo = pathname + search;

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("returnTo", returnTo);

  return NextResponse.redirect(loginUrl);
}

/**
 * Matcher: every path except API routes, Next.js internals, the login page,
 * and common static asset patterns.
 *
 * Note: per the Next.js 16 docs, `_next/data` routes are always processed by
 * the proxy even when excluded from the pattern. This is intentional — it
 * prevents accidentally leaving RSC data routes unprotected.
 */
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|login|favicon\\.ico|sitemap\\.xml|robots\\.txt).*)",
  ],
};
