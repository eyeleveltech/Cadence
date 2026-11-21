import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/crypto";
import { getSession } from "@/lib/session";
import { verifyOAuthState } from "@/lib/social/oauth-state";
import { revalidatePath } from "next/cache";

type InstagramAccount = {
  id: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
};

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const providerError = request.nextUrl.searchParams.get("error");
  const stateParam = request.nextUrl.searchParams.get("state");

  console.log("[oauth:instagram:callback] Unified Instagram callback received:", {
    hasCode: Boolean(code),
    hasState: Boolean(stateParam),
    providerError,
  });

  // Decode state parameter (supports base64url JSON or signed state)
  let clientId: string | null = null;
  let returnTo: string = "/";

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
          returnTo = verified.returnTo || "/";
        }
      }
    }
  }

  if (!clientId) {
    clientId = request.nextUrl.searchParams.get("clientId");
  }

  // Fallback to first client in DB if none found
  if (!clientId) {
    const firstClient = await prisma.client.findFirst({ select: { id: true } });
    clientId = firstClient?.id || null;
  }

  const targetUrl = (query: string) => {
    const cleanReturnTo = (returnTo || "/").replace(/#.*$/, "");
    const sep = cleanReturnTo.includes("?") ? "&" : "?";
    return new URL(`${cleanReturnTo}${sep}${query}`, request.url);
  };

  if (providerError || !code) {
    console.warn("[oauth:instagram:callback] Access denied or missing code:", providerError);
    return NextResponse.redirect(
      targetUrl(`error=${encodeURIComponent(providerError || "denied")}&oauth_error=${encodeURIComponent(providerError || "denied")}&platform=instagram`),
    );
  }

  if (!clientId) {
    console.error("[oauth:instagram:callback] Could not identify target client.");
    return NextResponse.redirect(new URL("/clients", request.url));
  }

  try {
    const appId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID;
    const appSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
      throw new Error("Missing INSTAGRAM_APP_ID/META_APP_ID or secret in environment.");
    }

    const redirectUri = `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/api/oauth/instagram/callback`;

    // 1. Exchange authorization code for access token via Graph API v22.0
    console.log(`[oauth:instagram:callback] Exchanging code for token (redirectUri=${redirectUri})...`);
    const tokenParams = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });

    const tokenRes = await fetch(`https://graph.facebook.com/v22.0/oauth/access_token?${tokenParams}`);
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error(`[oauth:instagram:callback] Token exchange failed (${tokenRes.status}):`, errText);
      throw new Error(`Token exchange failed: ${errText}`);
    }

    const tokenData = (await tokenRes.json()) as { access_token: string; expires_in?: number };
    let accessToken = tokenData.access_token;
    let expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null;
    console.log(`[oauth:instagram:callback] Short-lived token received (expires in: ${tokenData.expires_in ?? "N/A"}s)`);

    // Upgrade to 60-day long-lived token
    try {
      const exchangeParams = new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: accessToken,
      });
      const longRes = await fetch(`https://graph.facebook.com/v22.0/oauth/access_token?${exchangeParams}`);
      if (longRes.ok) {
        const longData = (await longRes.json()) as { access_token: string; expires_in?: number };
        if (longData.access_token) {
          accessToken = longData.access_token;
          if (longData.expires_in) {
            expiresAt = new Date(Date.now() + longData.expires_in * 1000);
          }
          console.log(`[oauth:instagram:callback] Upgraded to long-lived 60-day token (expires: ${expiresAt?.toISOString()})`);
        }
      }
    } catch (err) {
      console.warn("[oauth:instagram:callback] Long-lived exchange warning (continuing with token):", err);
    }

    // 2. Retrieve Instagram Account directly under Unified Login (DO NOT require or query Facebook Pages)
    let account: InstagramAccount | null = null;

    console.log("[oauth:instagram:callback] Querying /me/assigned_instagram_accounts...");
    try {
      const assignedRes = await fetch(
        `https://graph.facebook.com/v22.0/me/assigned_instagram_accounts?fields=id,username,name,profile_picture_url&access_token=${accessToken}`,
      );
      if (assignedRes.ok) {
        const assignedData = (await assignedRes.json()) as { data?: InstagramAccount[] };
        if (assignedData.data && assignedData.data.length > 0) {
          account = assignedData.data[0];
          console.log(`[oauth:instagram:callback] Found assigned Instagram account: @${account.username} (ID: ${account.id})`);
        }
      } else {
        console.warn(`[oauth:instagram:callback] /me/assigned_instagram_accounts returned status ${assignedRes.status}`);
      }
    } catch (err) {
      console.warn("[oauth:instagram:callback] /me/assigned_instagram_accounts query error:", err);
    }

    // Fallback: Query /me directly
    if (!account || !account.id) {
      console.log("[oauth:instagram:callback] Falling back to /me query...");
      try {
        const meRes = await fetch(
          `https://graph.facebook.com/v22.0/me?fields=id,username,name,profile_picture_url&access_token=${accessToken}`,
        );
        if (meRes.ok) {
          const meData = (await meRes.json()) as InstagramAccount;
          if (meData.id) {
            account = meData;
            console.log(`[oauth:instagram:callback] Found account via /me: @${account.username || account.name} (ID: ${account.id})`);
          }
        }
      } catch (err) {
        console.warn("[oauth:instagram:callback] /me fallback query error:", err);
      }
    }

    // Fallback: If username/id still not populated, check if linked on any accounts
    if (!account || !account.id) {
      try {
        const pagesRes = await fetch(
          `https://graph.facebook.com/v22.0/me/accounts?fields=id,name,instagram_business_account{id,username,name,profile_picture_url}&access_token=${accessToken}`,
        );
        if (pagesRes.ok) {
          const pagesData = (await pagesRes.json()) as {
            data?: Array<{ instagram_business_account?: InstagramAccount }>;
          };
          for (const p of pagesData.data ?? []) {
            if (p.instagram_business_account?.id) {
              account = p.instagram_business_account;
              console.log(`[oauth:instagram:callback] Found linked Instagram from page: @${account.username} (ID: ${account.id})`);
              break;
            }
          }
        }
      } catch (err) {
        console.warn("[oauth:instagram:callback] Page fallback query error:", err);
      }
    }

    if (!account || !account.id) {
      throw new Error("Unable to retrieve Instagram account details from Meta Unified Login.");
    }

    const username = account.username || (account.name ? account.name.replace(/\s+/g, "").toLowerCase() : `ig_${account.id}`);
    const cleanHandle = `@${username.replace(/^@+/, "")}`;
    const session = await getSession();
    const connectedById = session?.user?.id || null;

    // 3. Purge any older sandbox accounts for this client & platform
    await prisma.socialAccount.deleteMany({
      where: {
        clientId,
        platform: "INSTAGRAM",
        externalAccountId: { startsWith: "sandbox_" },
      },
    }).catch(() => {});

    // 4. Save directly into SocialAccount for the target clientId (Per-Client Isolation)
    console.log(`[oauth:instagram:callback] Saving SocialAccount for client ${clientId}: ${cleanHandle} (${account.id})`);
    await prisma.socialAccount.upsert({
      where: {
        clientId_platform: {
          clientId,
          platform: "INSTAGRAM",
        },
      },
      create: {
        clientId,
        platform: "INSTAGRAM",
        externalAccountId: account.id,
        accountName: cleanHandle,
        avatarUrl: account.profile_picture_url || null,
        accessToken: encryptToken(accessToken),
        refreshToken: null,
        tokenType: "USER",
        tokenExpiresAt: expiresAt,
        connectionStatus: "CONNECTED",
        statusDetail: null,
        scopes: ["instagram_basic", "instagram_content_publish", "business_management"],
        connectedById,
        lastHealthCheckAt: new Date(),
      },
      update: {
        externalAccountId: account.id,
        accountName: cleanHandle,
        avatarUrl: account.profile_picture_url || null,
        accessToken: encryptToken(accessToken),
        tokenType: "USER",
        tokenExpiresAt: expiresAt,
        connectionStatus: "CONNECTED",
        statusDetail: null,
        scopes: ["instagram_basic", "instagram_content_publish", "business_management"],
        connectedById: connectedById ?? undefined,
        lastHealthCheckAt: new Date(),
      },
    });

    if (connectedById) {
      await prisma.auditLog.create({
        data: {
          userId: connectedById,
          action: "SOCIAL_ACCOUNT_CONNECTED",
          entityType: "Client",
          entityId: clientId,
          metadata: {
            platform: "instagram",
            accountName: cleanHandle,
            externalAccountId: account.id,
            mode: "UNIFIED_INSTAGRAM_LOGIN",
          },
        },
      }).catch(() => {});
    }

    revalidatePath(`/clients/${clientId}/settings`);
    revalidatePath(`/clients/${clientId}/plan`);
    revalidatePath("/posts");

    console.log(`[oauth:instagram:callback] Successfully connected Instagram account ${cleanHandle}. Redirecting...`);
    return NextResponse.redirect(
      targetUrl("connected=instagram&oauth_success=1&platform=instagram"),
    );
  } catch (err) {
    console.error("[oauth:instagram:callback] Unified Instagram connection failed:", err);
    const msg = err instanceof Error ? err.message : "failed";
    return NextResponse.redirect(
      targetUrl(`error=failed&oauth_error=${encodeURIComponent(msg)}&platform=instagram`),
    );
  }
}
