import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Cookie-presence check only — fast, no DB round trip on every request.
// Actual session validity and role/client scoping is enforced in
// lib/session.ts on the server components and actions themselves, since
// middleware can't safely make Prisma calls (no Node runtime by default).
// /review needs a real session like everything else — a client reviewer
// gets there via the magic-link verify redirect, which only fires once
// Better Auth has already set the session cookie.
const PUBLIC_PATHS = ["/login", "/api/auth", "/demo"];

// Endpoints that authenticate themselves and must answer with a status
// code, not a redirect. Bouncing these to /login hands an <img> or an
// EventSource an HTML login page instead of a clean 401.
// /api/meta is called by Meta, not by a browser with a session — it
// verifies the request's HMAC signature itself.
const SELF_AUTHENTICATING_PATHS = ["/api/media", "/api/notifications", "/api/meta"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (SELF_AUTHENTICATING_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
