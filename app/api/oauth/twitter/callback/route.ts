import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { saveConnectedAccount } from "@/lib/actions/social-accounts";
import { verifyOAuthState } from "@/lib/social/oauth-state";
import { getOAuthRedirectUri, getSafeRedirectUrl } from "@/lib/social/oauth-utils";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const providerError = request.nextUrl.searchParams.get("error");
  const errorDescription = request.nextUrl.searchParams.get("error_description");
  const stateParam = request.nextUrl.searchParams.get("state");

  console.log("[Twitter OAuth Callback] Received callback:", {
    hasCode: Boolean(code),
    hasState: Boolean(stateParam),
    providerError,
    errorDescription,
  });

  const cookieStore = await cookies();
  const codeVerifier = cookieStore.get("twitter_oauth_verifier")?.value;

  // Clean up cookies
  cookieStore.delete("twitter_oauth_verifier");
  cookieStore.delete("twitter_oauth_state");

  let clientId: string | null = null;
  let returnTo: string = "/posts";

  // Decode state parameter (supports base64url JSON or signed state)
  if (stateParam) {
    try {
      const decoded = JSON.parse(Buffer.from(stateParam, "base64url").toString("utf8"));
      if (decoded.clientId) clientId = decoded.clientId;
      if (decoded.returnTo) returnTo = decoded.returnTo;
    } catch {
      const session = await getSession();
      if (session) {
        const verified = verifyOAuthState(stateParam, session.session.id);
        if (verified) {
          clientId = verified.clientId;
          returnTo = verified.returnTo || "/posts";
        }
      }
    }
  }

  // If no clientId in state, fall back to first client the user has access to
  if (!clientId) {
    const session = await getSession();
    if (session) {
      const membership = await prisma.clientMember.findFirst({
        where: { userId: session.user.id },
        select: { clientId: true },
      });
      if (membership) {
        clientId = membership.clientId;
      } else {
        const client = await prisma.client.findFirst({ select: { id: true } });
        if (client) clientId = client.id;
      }
    }
  }

  const targetUrl = (query: string): string => {
    const fallback = clientId ? `/clients/${clientId}/settings` : "/posts";
    const url = getSafeRedirectUrl(returnTo && returnTo !== "/" ? returnTo : fallback);
    const searchParams = new URLSearchParams(query);
    searchParams.forEach((value, key) => {
      url.searchParams.set(key, value);
    });
    return url.toString();
  };

  if (providerError || !code) {
    const err = providerError || errorDescription || "OAuth authorization failed";
    console.warn("[Twitter OAuth Callback] Authorization error:", err);
    return NextResponse.redirect(
      targetUrl(`error=${encodeURIComponent(err)}&oauth_error=${encodeURIComponent(err)}&platform=twitter`)
    );
  }

  if (!codeVerifier) {
    console.error("[Twitter OAuth Callback] Missing code_verifier from cookie");
    return NextResponse.redirect(
      targetUrl(`error=missing_verifier&oauth_error=${encodeURIComponent("Missing PKCE code verifier")}&platform=twitter`)
    );
  }

  const clientIdEnv =
    process.env.TWITTER_CLIENT_ID ||
    process.env.X_CLIENT_ID ||
    "QVN1YkNqRjBtVXU5V3BDTGlNTX2k6MTpjaQ";
  const clientSecretEnv =
    process.env.TWITTER_CLIENT_SECRET ||
    process.env.X_CLIENT_SECRET;

  if (!clientIdEnv || !clientSecretEnv) {
    console.error("[Twitter OAuth Callback] Twitter client credentials missing in environment");
    return NextResponse.redirect(
      targetUrl(`error=server_configuration&oauth_error=${encodeURIComponent("Twitter client ID or secret not configured")}&platform=twitter`)
    );
  }

  // CRITICAL: Must exactly match the redirect_uri sent during authorization
  const redirectUri = process.env.TWITTER_REDIRECT_URI || getOAuthRedirectUri("twitter");

  try {
    console.log("[Twitter OAuth Callback] Exchanging authorization code for token with redirectUri:", redirectUri);
    const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientIdEnv}:${clientSecretEnv}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[Twitter OAuth Callback] Token exchange failed:", errText);
      return NextResponse.redirect(
        targetUrl(`error=token_exchange_failed&oauth_error=${encodeURIComponent(errText)}&platform=twitter`)
      );
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };

    console.log("[Twitter OAuth Callback] Token exchange succeeded. Fetching user info...");
    const userRes = await fetch("https://api.twitter.com/2/users/me?user.fields=profile_image_url", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    let externalAccountId = "twitter_me";
    let accountName = "X (Twitter) Account";
    let avatarUrl: string | undefined;

    if (userRes.ok) {
      const userData = (await userRes.json()) as {
        data?: { id: string; name: string; username: string; profile_image_url?: string };
      };
      if (userData.data) {
        externalAccountId = userData.data.id;
        accountName = `@${userData.data.username}`;
        avatarUrl = userData.data.profile_image_url;
      }
    } else {
      console.warn("[Twitter OAuth Callback] /users/me returned non-ok, using fallback account info:", await userRes.text());
    }

    const session = await getSession();
    if (!session) {
      return NextResponse.redirect(
        targetUrl(`error=unauthorized&oauth_error=Session+expired&platform=twitter`)
      );
    }

    if (!clientId) {
      return NextResponse.redirect(
        targetUrl(`error=missing_client&oauth_error=No+target+client+workspace+specified&platform=twitter`)
      );
    }

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : undefined;

    const scopes = tokenData.scope
      ? tokenData.scope.split(" ").filter(Boolean)
      : ["tweet.read", "tweet.write", "users.read"];

    console.log(`[Twitter OAuth Callback] Saving connected account for client ${clientId}: ${accountName} (${externalAccountId})`);
    await saveConnectedAccount({
      clientId,
      platform: "twitter",
      account: {
        externalAccountId,
        accountName,
        avatarUrl,
        scopes,
        tokenType: "USER",
        accessToken: tokenData.access_token,
        expiresAt,
      },
      connectedById: session.user.id,
      refreshToken: tokenData.refresh_token,
    });

    console.log("[Twitter OAuth Callback] Successfully connected Twitter account!");
    return NextResponse.redirect(
      targetUrl(`connected=twitter&oauth_success=1&platform=twitter`)
    );
  } catch (err) {
    console.error("[Twitter OAuth Callback] Unexpected error:", err);
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.redirect(
      targetUrl(`error=internal_error&oauth_error=${encodeURIComponent(msg)}&platform=twitter`)
    );
  }
}
