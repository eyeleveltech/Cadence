import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getOAuthAdapter, isPlatformSlug } from "@/lib/social/oauth";
import { verifyOAuthState } from "@/lib/social/oauth-state";
import { setPendingConnection } from "@/lib/social/pending-connection";
import { saveConnectedAccount } from "@/lib/actions/social-accounts";

export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  if (!isPlatformSlug(platform)) return new Response("Unknown platform", { status: 404 });

  const code = request.nextUrl.searchParams.get("code");
  const providerError = request.nextUrl.searchParams.get("error");
  const stateParam = request.nextUrl.searchParams.get("state");

  // Identify the caller before trusting the state, since the state is
  // only valid for the session that started the flow.
  const session = await getSession();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.redirect(new URL("/login?next=/clients", request.url));
  }

  const payload = stateParam ? verifyOAuthState(stateParam, session.session.id) : null;

  // No verified state means we don't even know which client this was
  // for — can't bounce back to their settings page, so just go home.
  if (!payload || payload.platform !== platform) {
    return NextResponse.redirect(new URL("/clients", request.url));
  }

  const settingsUrl = (query: string) =>
    new URL(`/clients/${payload.clientId}/settings?${query}`, request.url);

  if (providerError || !code) {
    return NextResponse.redirect(settingsUrl(`oauth_error=denied&platform=${platform}`));
  }

  try {
    const adapter = getOAuthAdapter(platform);
    const redirectUri = `${process.env.BETTER_AUTH_URL}/api/oauth/${platform}/callback`;
    const token = await adapter.exchangeCode(code, redirectUri);

    // Every asset this login can reach, not just the first one.
    const available = await adapter.listAccounts(token);

    if (available.length === 0) {
      return NextResponse.redirect(settingsUrl(`oauth_error=no_accounts&platform=${platform}`));
    }

    // Exactly one asset is the unambiguous case — nothing to choose.
    if (available.length === 1) {
      await saveConnectedAccount({
        clientId: payload.clientId,
        platform,
        account: available[0],
        connectedById: session.user.id,
        refreshToken: token.refreshToken,
      });
      return NextResponse.redirect(settingsUrl(`oauth_success=1&platform=${platform}`));
    }

    // More than one — with Business Manager partner access this is the
    // normal case, because one agency login administers every client's
    // Page. Guessing here is how a post ends up on the wrong brand, so
    // hold the token briefly and ask.
    await setPendingConnection({
      clientId: payload.clientId,
      platform,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt?.toISOString(),
    });

    return NextResponse.redirect(
      new URL(`/clients/${payload.clientId}/settings/connect/${platform}`, request.url),
    );
  } catch (err) {
    console.error(`[oauth:${platform}] connect failed:`, err);
    return NextResponse.redirect(settingsUrl(`oauth_error=failed&platform=${platform}`));
  }
}
