import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getOAuthAdapter, isPlatformSlug } from "@/lib/social/oauth";
import { signOAuthState, generateCodeVerifier, generateCodeChallenge, verifyOAuthState } from "@/lib/social/oauth-state";
import { setPendingConnection } from "@/lib/social/pending-connection";
import { saveConnectedAccount } from "@/lib/actions/social-accounts";
import { getOAuthRedirectUri } from "@/lib/social/oauth-utils";

export async function handleOAuthConnect(platform: string, request: NextRequest) {
  if (!isPlatformSlug(platform)) return new Response("Unknown platform", { status: 404 });

  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) return new Response("Missing clientId", { status: 400 });

  const returnTo = request.nextUrl.searchParams.get("returnTo") ?? undefined;

  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(returnTo ?? `/clients/${clientId}/settings`)}`, request.url)
    );
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
    return NextResponse.redirect(new URL(returnTo ?? `/clients/${clientId}/settings`, request.url));
  }

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) return new Response("Not found", { status: 404 });

  const adapter = getOAuthAdapter(platform);
  if (!adapter.isConfigured()) {
    const errorTarget = returnTo
      ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}oauth_error=not_configured&platform=${platform}`
      : `/clients/${clientId}/settings?oauth_error=not_configured&platform=${platform}`;
    return NextResponse.redirect(new URL(errorTarget, request.url));
  }

  let codeVerifier: string | undefined;
  let codeChallenge: string | undefined;
  if (platform === "twitter") {
    codeVerifier = generateCodeVerifier();
    codeChallenge = generateCodeChallenge(codeVerifier);
  }

  const requestedScopes = request.nextUrl.searchParams.get("scopes") || request.nextUrl.searchParams.get("scope");
  const customScopes = requestedScopes ? requestedScopes.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

  const state = signOAuthState(clientId, platform, session.session.id, codeVerifier, returnTo);
  const redirectUri = getOAuthRedirectUri(platform);
  return NextResponse.redirect(adapter.authorizeUrl(redirectUri, state, { codeChallenge, scopes: customScopes }));
}

export async function handleOAuthCallback(platform: string, request: NextRequest) {
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

  const session = await getSession();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    console.warn(`[oauth:${platform}:callback] Unauthorized session or missing admin/manager role.`);
    return NextResponse.redirect(new URL("/login?next=/clients", request.url));
  }

  const payload = stateParam ? verifyOAuthState(stateParam, session.session.id) : null;

  if (!payload || payload.platform !== platform) {
    console.warn(`[oauth:${platform}:callback] State verification failed or platform mismatch.`);
    return NextResponse.redirect(new URL("/clients", request.url));
  }

  const targetUrl = (query: string) => {
    if (payload.returnTo) {
      const cleanReturnTo = payload.returnTo.replace(/#.*$/, "");
      const sep = cleanReturnTo.includes("?") ? "&" : "?";
      return new URL(`${cleanReturnTo}${sep}${query}`, request.url);
    }
    return new URL(`/clients/${payload.clientId}/settings?${query}`, request.url);
  };

  if (providerError || !code) {
    console.warn(`[oauth:${platform}:callback] OAuth denied or missing code:`, providerError);
    return NextResponse.redirect(
      targetUrl(
        `error=${encodeURIComponent(providerError || "denied")}&oauth_error=${encodeURIComponent(providerError || "denied")}&platform=${platform}`
      )
    );
  }

  try {
    const adapter = getOAuthAdapter(platform);
    const redirectUri = getOAuthRedirectUri(platform);

    console.log(`[oauth:${platform}:callback] Exchanging authorization code for token... (redirectUri=${redirectUri})`);
    const token = await adapter.exchangeCode(code, redirectUri, {
      codeVerifier: payload.codeVerifier,
    });
    console.log(`[oauth:${platform}:callback] Token exchange succeeded. Listing accounts...`);

    const available = await adapter.listAccounts(token);
    console.log(
      `[oauth:${platform}:callback] Discovered ${available.length} account(s):`,
      available.map((a) => ({
        id: a.externalAccountId,
        name: a.accountName,
        hasLinkedIg: Boolean(a.linkedInstagram),
        hasLinkedFb: Boolean(a.linkedFacebookPage),
      }))
    );

    if (available.length === 0) {
      if (platform === "facebook" || platform === "instagram") {
        const warningMsg =
          platform === "facebook"
            ? "No Facebook Pages found under this account. Please create or manage a Page first."
            : "No Facebook Pages with a linked Instagram Professional account found. Please link your Instagram account to a Facebook Page first.";
        console.warn(`[oauth:${platform}:callback] ${warningMsg}`);
        return NextResponse.redirect(
          targetUrl(`warning=no_pages_found&message=${encodeURIComponent(warningMsg)}&platform=${platform}`)
        );
      }
      return NextResponse.redirect(
        targetUrl(`error=no_accounts&oauth_error=no_accounts&platform=${platform}`)
      );
    }

    if (available.length === 1 || payload.returnTo) {
      const primary = available[0];
      console.log(
        `[oauth:${platform}:callback] Saving primary connected account: ${primary.accountName} (${primary.externalAccountId})`
      );
      await saveConnectedAccount({
        clientId: payload.clientId,
        platform,
        account: primary,
        connectedById: session.user.id,
        refreshToken: token.refreshToken,
      });

      let hasIg = Boolean(primary.linkedInstagram);
      if (platform === "facebook" && primary.linkedInstagram) {
        try {
          console.log(
            `[oauth:facebook:callback] Auto-linking linked Instagram account: @${primary.linkedInstagram.username} (${primary.linkedInstagram.id})`
          );
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
        } catch (err) {
          console.warn("[oauth:facebook] auto-link instagram failed:", err);
          hasIg = false;
        }
      }

      let hasFb = Boolean(primary.linkedFacebookPage);
      if (platform === "instagram" && primary.linkedFacebookPage) {
        try {
          console.log(
            `[oauth:instagram:callback] Auto-linking linked Facebook Page: ${primary.linkedFacebookPage.name} (${primary.linkedFacebookPage.id})`
          );
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
        } catch (err) {
          console.warn("[oauth:instagram] auto-link facebook failed:", err);
          hasFb = false;
        }
      }

      const igParam = platform === "facebook" ? `&ig_connected=${hasIg ? "true" : "false"}` : "";
      const fbParam = platform === "instagram" ? `&fb_connected=${hasFb ? "true" : "false"}` : "";

      return NextResponse.redirect(
        targetUrl(`connected=${platform}${igParam}${fbParam}&oauth_success=1&platform=${platform}`)
      );
    }

    console.log(
      `[oauth:${platform}:callback] Multiple accounts available (${available.length}). Redirecting to picker...`
    );
    await setPendingConnection({
      clientId: payload.clientId,
      platform,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt?.toISOString(),
    });

    return NextResponse.redirect(
      new URL(`/clients/${payload.clientId}/settings/connect/${platform}`, request.url)
    );
  } catch (err) {
    console.error(`[oauth:${platform}:callback] Callback handler failed with exception:`, err);
    const msg = err instanceof Error ? err.message : "failed";
    return NextResponse.redirect(
      targetUrl(`error=failed&oauth_error=${encodeURIComponent(msg)}&platform=${platform}`)
    );
  }
}
