import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { authEmailLimiter, authMagicLinkLimiter, getClientIp } from "@/lib/rate-limit";

const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

/**
 * Better Auth exposes a sign-up endpoint whenever email+password is
 * enabled, and `/api/auth` is public by necessity — so until this was
 * here, anyone on the internet could POST to /api/auth/sign-up/email and
 * hand themselves an account on an internal agency tool, defaulting to
 * the WRITER role. Cadence has no self-serve tier: every account arrives
 * through inviteTeamMember or inviteClientReviewer.
 *
 * The block lives here, at the HTTP boundary, rather than as
 * `emailAndPassword.disableSignUp` in lib/auth.ts, because that flag is
 * checked inside the endpoint itself and would equally break the
 * server-side `auth.api.signUpEmail` calls that provision invited
 * accounts and seed the team. Requests that arrive over the network go
 * through this handler; direct server-side calls don't.
 *
 * Also enforces rate limiting on sign-in endpoints to prevent brute-force
 * and credential stuffing attacks.
 */
const BLOCKED_PATH = "/sign-up";

export async function POST(request: Request) {
  const { pathname } = new URL(request.url);

  if (pathname.includes(BLOCKED_PATH)) {
    return Response.json(
      { error: "Sign-up is closed — ask an admin for an invite." },
      { status: 404 },
    );
  }

  const clientIp = getClientIp(request.headers);

  if (pathname.includes("/sign-in/email")) {
    const check = authEmailLimiter.check(clientIp);
    if (!check.success) {
      return Response.json(
        { error: "Too many login attempts. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(check.retryAfterSeconds),
            "X-RateLimit-Limit": String(check.limit),
            "X-RateLimit-Remaining": "0",
          },
        },
      );
    }
  }

  if (pathname.includes("/sign-in/magic-link") || pathname.includes("/magic-link")) {
    const check = authMagicLinkLimiter.check(clientIp);
    if (!check.success) {
      return Response.json(
        { error: "Too many magic link requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(check.retryAfterSeconds),
            "X-RateLimit-Limit": String(check.limit),
            "X-RateLimit-Remaining": "0",
          },
        },
      );
    }
  }

  return handlers.POST(request);
}
