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

  console.log(`[oauth:${platform}:callback] Received callback:`, {
    hasCode: Boolean(code),
    codePrefix: code ? `${code.slice(0, 10)}...` : null,
    hasState: Boolean(stateParam),
    providerError,
  });

  // Identify the caller before trusting the state, since the state is
  // only valid for the session that started the flow.
  const session = await getSession();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    console.warn(`[oauth:${platform}:callback] Unauthorized session or missing admin/manager role.`);
    return NextResponse.redirect(new URL("/login?next=/clients", request.url));
  }

  const payload = stateParam ? verifyOAuthState(stateParam, session.session.id) : null;

  // No verified state means we don't even know which client this was
  // for — can't bounce back to their settings page, so just go home.
  if (!payload || payload.platform !== platform) {
    console.warn(`[oauth:${platform}:callback] State verification failed or platform mismatch.`);
    return NextResponse.redirect(new URL("/clients", request.url));
  }

  const targetUrl = (query: string) => {
    if (payload.returnTo) {
      // Strip any # fragments (such as Meta's #_=_ or hash anchors) from returnTo
      const cleanReturnTo = payload.returnTo.replace(/#.*$/, "");
      const sep = cleanReturnTo.includes("?") ? "&" : "?";
      return new URL(`${cleanReturnTo}${sep}${query}`, request.url);
    }
    return new URL(`/clients/${payload.clientId}/settings?${query}`, request.url);
  };

  if (providerError || !code) {
    console.warn(`[oauth:${platform}:callback] OAuth denied or missing code:`, providerError);
    return NextResponse.redirect(
      targetUrl(`error=${encodeURIComponent(providerError || "denied")}&oauth_error=${encodeURIComponent(providerError || "denied")}&platform=${platform}`),
    );
  }

  try {
    const adapter = getOAuthAdapter(platform);
    const redirectUri = `${process.env.BETTER_AUTH_URL}/api/oauth/${platform}/callback`;

    console.log(`[oauth:${platform}:callback] Exchanging authorization code for token... (redirectUri=${redirectUri})`);
    const token = await adapter.exchangeCode(code, redirectUri, {
      codeVerifier: payload.codeVerifier,
    });
    console.log(`[oauth:${platform}:callback] Token exchange succeeded. Listing accounts...`);

    // Every asset this login can reach, not just the first one.
    const available = await adapter.listAccounts(token);
    console.log(`[oauth:${platform}:callback] Discovered ${available.length} account(s):`, available.map((a) => ({
      id: a.externalAccountId,
      name: a.accountName,
      hasLinkedIg: Boolean(a.linkedInstagram),
      hasLinkedFb: Boolean(a.linkedFacebookPage),
    })));

    if (available.length === 0) {
      if (platform === "facebook" || platform === "instagram") {
        const warningMsg =
          platform === "facebook"
            ? "No Facebook Pages found under this account. Please create or manage a Page first."
            : "No Facebook Pages with a linked Instagram Professional account found. Please link your Instagram account to a Facebook Page first.";
        console.warn(`[oauth:${platform}:callback] ${warningMsg}`);
        return NextResponse.redirect(
          targetUrl(`warning=no_pages_found&message=${encodeURIComponent(warningMsg)}&platform=${platform}`),
        );
      }
      return NextResponse.redirect(
        targetUrl(`error=no_accounts&oauth_error=no_accounts&platform=${platform}`),
      );
    }

    // Single account OR fast-path returnTo flow (e.g. initiated directly from post editor)
    if (available.length === 1 || payload.returnTo) {
      const primary = available[0];
      console.log(`[oauth:${platform}:callback] Saving primary connected account: ${primary.accountName} (${primary.externalAccountId})`);
      await saveConnectedAccount({
        clientId: payload.clientId,
        platform,
        account: primary,
        connectedById: session.user.id,
        refreshToken: token.refreshToken,
      });

      // Smart Auto-Link: If Facebook has linked Instagram, automatically upsert Instagram
      let hasIg = Boolean(primary.linkedInstagram);
      if (platform === "facebook" && primary.linkedInstagram) {
        try {
          console.log(`[oauth:facebook:callback] Auto-linking linked Instagram account: @${primary.linkedInstagram.username} (${primary.linkedInstagram.id})`);
          await saveConnectedAccount({
            clientId: payload.clientId,
            platform: "instagram",
            account: {
              externalAccountId: primary.linkedInstagram.id,
              accountName: `@${primary.linkedInstagram.username.replace(/^@+/, "")}`,
              avatarUrl: primary.linkedInstagram.profile_picture_url,
              scopes: ["instagram_content_publish", "instagram_basic"],
              accessToken: primary.accessToken,
              tokenType: "PAGE",
            },
            connectedById: session.user.id,
          });
          hasIg = true;
          console.log(`[oauth:facebook:callback] Auto-link Instagram completed successfully.`);
        } catch (err) {
          console.warn("[oauth:facebook] auto-link instagram failed:", err);
          hasIg = false;
        }
      }

      // Smart Auto-Link: If Instagram has linked Facebook Page, automatically upsert Facebook
      let hasFb = Boolean(primary.linkedFacebookPage);
      if (platform === "instagram" && primary.linkedFacebookPage) {
        try {
          console.log(`[oauth:instagram:callback] Auto-linking linked Facebook Page: ${primary.linkedFacebookPage.name} (${primary.linkedFacebookPage.id})`);
          await saveConnectedAccount({
            clientId: payload.clientId,
            platform: "facebook",
            account: {
              externalAccountId: primary.linkedFacebookPage.id,
              accountName: primary.linkedFacebookPage.name,
              avatarUrl: primary.linkedFacebookPage.avatarUrl,
              scopes: ["pages_manage_posts", "pages_read_engagement"],
              accessToken: primary.linkedFacebookPage.access_token,
              tokenType: "PAGE",
            },
            connectedById: session.user.id,
          });
          hasFb = true;
          console.log(`[oauth:instagram:callback] Auto-link Facebook completed successfully.`);
        } catch (err) {
          console.warn("[oauth:instagram] auto-link facebook failed:", err);
          hasFb = false;
        }
      }

      const igParam = platform === "facebook" ? `&ig_connected=${hasIg ? "true" : "false"}` : "";
      const fbParam = platform === "instagram" ? `&fb_connected=${hasFb ? "true" : "false"}` : "";

      console.log(`[oauth:${platform}:callback] Redirecting back to target with connected status.`);
      return NextResponse.redirect(
        targetUrl(`connected=${platform}${igParam}${fbParam}&oauth_success=1&platform=${platform}`),
      );
    }

    // More than one without explicit returnTo: Agency user connecting from client settings.
    // Hold the token briefly and show the account picker.
    console.log(`[oauth:${platform}:callback] Multiple accounts available (${available.length}). Redirecting to picker...`);
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
    console.error(`[oauth:${platform}:callback] Callback handler failed with exception:`, err);
    const msg = err instanceof Error ? err.message : "failed";
    return NextResponse.redirect(
      targetUrl(`error=failed&oauth_error=${encodeURIComponent(msg)}&platform=${platform}`),
    );
  }
}
