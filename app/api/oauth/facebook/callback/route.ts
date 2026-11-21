import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { verifyOAuthState } from "@/lib/social/oauth-state";
import { saveConnectedAccount } from "@/lib/actions/social-accounts";
import { setPendingConnection } from "@/lib/social/pending-connection";
import { revalidatePath } from "next/cache";

type MetaPage = {
  id: string;
  name: string;
  access_token?: string;
  category?: string;
  tasks?: string[];
  picture?: { data?: { url?: string } };
  instagram_business_account?: {
    id: string;
    username: string;
    name?: string;
    profile_picture_url?: string;
  };
};

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const providerError = request.nextUrl.searchParams.get("error");
  const errorDescription = request.nextUrl.searchParams.get("error_description");
  const stateParam = request.nextUrl.searchParams.get("state");

  console.log("[Facebook OAuth Callback] Received callback:", {
    hasCode: Boolean(code),
    hasState: Boolean(stateParam),
    providerError,
    errorDescription,
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
    console.warn("[Facebook OAuth Callback] Access denied or missing code:", providerError || errorDescription);
    const err = providerError || errorDescription || "denied";
    return NextResponse.redirect(
      targetUrl(`error=${encodeURIComponent(err)}&oauth_error=${encodeURIComponent(err)}&platform=facebook`),
    );
  }

  if (!clientId) {
    console.error("[Facebook OAuth Callback] Target client could not be identified.");
    return NextResponse.redirect(new URL("/clients", request.url));
  }

  try {
    const appId = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET;
    const graphVersion = process.env.META_GRAPH_API_VERSION ?? "v22.0";

    if (!appId || !appSecret) {
      throw new Error("Missing META_APP_ID or META_APP_SECRET in environment.");
    }

    const redirectUri = `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/api/oauth/facebook/callback`;

    // 1. Exchange authorization code for short-lived user token
    console.log(`[Facebook OAuth Callback] Exchanging code for user token (redirectUri=${redirectUri})...`);
    const tokenParams = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });

    const tokenRes = await fetch(`https://graph.facebook.com/${graphVersion}/oauth/access_token?${tokenParams}`);
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error(`[Facebook OAuth Callback] Token exchange failed (${tokenRes.status}):`, errText);
      throw new Error(`Token exchange failed: ${errText}`);
    }

    const shortTokenData = (await tokenRes.json()) as { access_token: string; expires_in?: number };
    console.log(`[Facebook OAuth Callback] Received short-lived token (${shortTokenData.access_token.slice(0, 12)}...)`);

    // 2. Exchange for 60-day long-lived user token
    let userAccessToken = shortTokenData.access_token;
    try {
      const exchangeParams = new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortTokenData.access_token,
      });
      const longRes = await fetch(`https://graph.facebook.com/${graphVersion}/oauth/access_token?${exchangeParams}`);
      if (longRes.ok) {
        const longData = (await longRes.json()) as { access_token: string; expires_in?: number };
        userAccessToken = longData.access_token;
        console.log(`[Facebook OAuth Callback] Upgraded to long-lived token (${userAccessToken.slice(0, 12)}...)`);
      }
    } catch (longErr) {
      console.warn("[Facebook OAuth Callback] Long-lived exchange failed, continuing with short-lived:", longErr);
    }

    console.log("[Facebook OAuth Callback] Exchanged user access token successfully.");

    // Log the authenticated Facebook user
    try {
      const meUserRes = await fetch(`https://graph.facebook.com/${graphVersion}/me?fields=id,name&access_token=${userAccessToken}`);
      if (meUserRes.ok) {
        const meUserData = (await meUserRes.json()) as { id: string; name: string };
        console.log(`[Facebook OAuth Callback] Authenticated as Facebook User: ${meUserData.name} (${meUserData.id})`);
      }
    } catch (meUserErr) {
      console.warn("[Facebook OAuth Callback] Could not fetch /me user profile:", meUserErr);
    }

    // 3. Multi-Strategy Page Discovery with Verbose Logging
    const pageFields = "id,name,access_token,category,tasks,instagram_business_account{id,username,name,profile_picture_url}";

    // Strategy 1: Primary /me/accounts endpoint with limit=100
    console.log(`[Facebook OAuth Callback] Querying /me/accounts with Graph API ${graphVersion}...`);
    const accountsRes = await fetch(
      `https://graph.facebook.com/${graphVersion}/me/accounts?fields=${pageFields}&limit=100&access_token=${userAccessToken}`
    );
    const accountsData = (await accountsRes.json()) as { data?: MetaPage[]; error?: unknown };
    console.log("[Facebook Accounts Response]:", JSON.stringify(accountsData, null, 2));

    let pages: MetaPage[] = accountsData.data || [];

    // Strategy 2: Fallback to /me?fields=accounts{...}
    if (pages.length === 0) {
      console.log("[Facebook OAuth] /me/accounts returned 0 pages. Trying /me?fields=accounts fallback...");
      try {
        const meAccountsRes = await fetch(
          `https://graph.facebook.com/${graphVersion}/me?fields=id,name,accounts{${pageFields}}&access_token=${userAccessToken}`
        );
        const meAccountsData = (await meAccountsRes.json()) as { accounts?: { data?: MetaPage[] } };
        console.log("[Facebook OAuth /me nested accounts response]:", JSON.stringify(meAccountsData, null, 2));
        if (meAccountsData.accounts?.data && meAccountsData.accounts.data.length > 0) {
          pages = meAccountsData.accounts.data;
        }
      } catch (nestedErr) {
        console.warn("[Facebook OAuth] /me?fields=accounts query error:", nestedErr);
      }
    }

    // Strategy 3: Check Business Portfolios (/me/businesses)
    if (pages.length === 0) {
      console.log("[Facebook OAuth] Still 0 pages. Checking /me/businesses...");
      try {
        const bizRes = await fetch(
          `https://graph.facebook.com/${graphVersion}/me/businesses?fields=id,name,client_pages{id,name,access_token},owned_pages{id,name,access_token}&access_token=${userAccessToken}`
        );
        const bizData = (await bizRes.json()) as {
          data?: Array<{
            id: string;
            name?: string;
            client_pages?: { data?: MetaPage[] };
            owned_pages?: { data?: MetaPage[] };
          }>;
        };
        console.log("[Facebook OAuth /me/businesses response]:", JSON.stringify(bizData, null, 2));
        if (bizData.data) {
          for (const biz of bizData.data) {
            if (biz.client_pages?.data) {
              pages.push(...biz.client_pages.data);
            }
            if (biz.owned_pages?.data) {
              pages.push(...biz.owned_pages.data);
            }
          }
        }
      } catch (bizErr) {
        console.warn("[Facebook OAuth] Error querying /me/businesses:", bizErr);
      }
    }

    // Strategy 4: Fallback child queries for businesses
    if (pages.length === 0) {
      try {
        const bizListRes = await fetch(`https://graph.facebook.com/${graphVersion}/me/businesses?access_token=${userAccessToken}`);
        if (bizListRes.ok) {
          const bizList = (await bizListRes.json()) as { data?: Array<{ id: string; name?: string }> };
          for (const biz of bizList.data || []) {
            const ownedRes = await fetch(
              `https://graph.facebook.com/${graphVersion}/${biz.id}/owned_pages?fields=id,name,access_token&access_token=${userAccessToken}`
            );
            if (ownedRes.ok) {
              const ownedData = (await ownedRes.json()) as { data?: MetaPage[] };
              if (ownedData.data) pages.push(...ownedData.data);
            }
            const clientRes = await fetch(
              `https://graph.facebook.com/${graphVersion}/${biz.id}/client_pages?fields=id,name,access_token&access_token=${userAccessToken}`
            );
            if (clientRes.ok) {
              const clientData = (await clientRes.json()) as { data?: MetaPage[] };
              if (clientData.data) pages.push(...clientData.data);
            }
          }
        }
      } catch (childBizErr) {
        console.warn("[Facebook OAuth] Error querying business child pages:", childBizErr);
      }
    }

    // Deduplicate pages by page id
    const seen = new Set<string>();
    const uniquePages = pages.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
    pages = uniquePages;

    if (pages.length === 0) {
      console.error("[Facebook OAuth Error] Zero pages discovered across all endpoints for user token.");
      const warningMsg = "No Facebook Pages found under this account. Please create or manage a Page first.";
      return NextResponse.redirect(
        targetUrl(`warning=no_pages_found&message=${encodeURIComponent(warningMsg)}&platform=facebook`)
      );
    }

    console.log(`[Facebook OAuth] Discovered ${pages.length} unique Facebook Page(s):`, pages.map((p) => ({
      id: p.id,
      name: p.name,
      hasAccessToken: Boolean(p.access_token),
    })));

    // 4. Select Target Page and Ensure Page Access Token is obtained
    const targetPage = pages[0];
    console.log(`[Facebook OAuth] Connecting Page: ${targetPage.name} (${targetPage.id})`);

    let pageToken = targetPage.access_token;
    if (!pageToken) {
      console.log(`[Facebook OAuth] Querying /{page.id}?fields=access_token for Page Access Token...`);
      const tokenRes = await fetch(
        `https://graph.facebook.com/${graphVersion}/${targetPage.id}?fields=access_token&access_token=${userAccessToken}`
      );
      const tokenData = (await tokenRes.json()) as { access_token?: string };
      console.log("[Facebook OAuth Page token query response]:", JSON.stringify({ ok: tokenRes.ok, hasToken: Boolean(tokenData.access_token) }));
      pageToken = tokenData.access_token;
    }

    if (!pageToken) {
      throw new Error(`Could not obtain a Page Access Token for Page "${targetPage.name}" (${targetPage.id}). Ensure pages_manage_posts and pages_read_engagement permissions are granted.`);
    }

    console.log(`[Facebook OAuth] Storing Page Access Token for Page: "${targetPage.name}" (${targetPage.id}). Token starts with: ${pageToken.slice(0, 15)}...`);

    // Fetch avatar and linked Instagram account if available
    let avatarUrl: string | undefined = targetPage.picture?.data?.url;
    let linkedIg = targetPage.instagram_business_account;

    try {
      const extraRes = await fetch(
        `https://graph.facebook.com/${graphVersion}/${targetPage.id}?fields=picture{url},instagram_business_account{id,username,name,profile_picture_url}&access_token=${pageToken}`
      );
      if (extraRes.ok) {
        const extraData = (await extraRes.json()) as {
          picture?: { data?: { url?: string } };
          instagram_business_account?: {
            id: string;
            username: string;
            name?: string;
            profile_picture_url?: string;
          };
        };
        if (extraData.picture?.data?.url) avatarUrl = extraData.picture.data.url;
        if (extraData.instagram_business_account) linkedIg = extraData.instagram_business_account;
      }
    } catch (extraErr) {
      console.warn("[Facebook OAuth] Optional picture/instagram query with page token failed:", extraErr);
    }

    // Fallback: Query page with userAccessToken if instagram_business_account still missing
    if (!linkedIg) {
      try {
        const igUserRes = await fetch(
          `https://graph.facebook.com/${graphVersion}/${targetPage.id}?fields=instagram_business_account{id,username,name,profile_picture_url}&access_token=${userAccessToken}`
        );
        if (igUserRes.ok) {
          const igUserData = (await igUserRes.json()) as {
            instagram_business_account?: {
              id: string;
              username: string;
              name?: string;
              profile_picture_url?: string;
            };
          };
          if (igUserData.instagram_business_account) {
            linkedIg = igUserData.instagram_business_account;
            console.log(`[Facebook OAuth] Discovered Instagram business account via userAccessToken: @${linkedIg.username || linkedIg.name}`);
          }
        }
      } catch (igUserErr) {
        console.warn("[Facebook OAuth] Instagram query with user token failed:", igUserErr);
      }
    }

    // Fallback: Check assigned_instagram_accounts
    if (!linkedIg) {
      try {
        const assignedRes = await fetch(
          `https://graph.facebook.com/${graphVersion}/me/assigned_instagram_accounts?fields=id,username,name,profile_picture_url&access_token=${userAccessToken}`
        );
        if (assignedRes.ok) {
          const assignedData = (await assignedRes.json()) as {
            data?: Array<{ id: string; username?: string; name?: string; profile_picture_url?: string }>;
          };
          if (assignedData.data && assignedData.data.length > 0) {
            const firstAssigned = assignedData.data[0];
            linkedIg = {
              id: firstAssigned.id,
              username: firstAssigned.username || firstAssigned.name || "instagram",
              name: firstAssigned.name,
              profile_picture_url: firstAssigned.profile_picture_url,
            };
            console.log(`[Facebook OAuth] Discovered assigned Instagram account: @${linkedIg.username}`);
          }
        }
      } catch (assignedErr) {
        console.warn("[Facebook OAuth] assigned_instagram_accounts query failed:", assignedErr);
      }
    }

    const session = await getSession();
    const userId = session?.user?.id ?? "system";

    // 5. Store Page Access Token in database as SocialAccount
    await saveConnectedAccount({
      clientId,
      platform: "facebook",
      account: {
        externalAccountId: targetPage.id,
        accountName: targetPage.name,
        avatarUrl: avatarUrl || undefined,
        scopes: ["pages_manage_posts", "pages_read_engagement", "pages_show_list"],
        accessToken: pageToken, // <-- CRITICAL: Storing the Page Access Token
        tokenType: "PAGE",
      },
      connectedById: userId,
    });

    // Smart Auto-Link: If the page has a linked Instagram professional account, save it as well
    let hasIg = false;
    if (linkedIg) {
      try {
        const igHandle = `@${(linkedIg.username || linkedIg.name || "instagram").replace(/^@+/, "")}`;
        console.log(`[Facebook OAuth] Auto-linking linked Instagram account: ${igHandle} (${linkedIg.id})`);
        await saveConnectedAccount({
          clientId,
          platform: "instagram",
          account: {
            externalAccountId: linkedIg.id,
            accountName: igHandle,
            avatarUrl: linkedIg.profile_picture_url,
            scopes: ["instagram_content_publish", "instagram_basic"],
            accessToken: pageToken,
            tokenType: "PAGE",
          },
          connectedById: userId,
        });
        hasIg = true;
        console.log("[Facebook OAuth] Auto-linked Instagram account successfully.");
      } catch (igErr) {
        console.warn("[Facebook OAuth] Auto-linking Instagram failed:", igErr);
      }
    }

    // Multiple accounts picker fallback if initiated without returnTo
    if (pages.length > 1 && !returnTo) {
      await setPendingConnection({
        clientId,
        platform: "facebook",
        accessToken: userAccessToken,
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      });
      return NextResponse.redirect(
        new URL(`/clients/${clientId}/settings/connect/facebook`, request.url),
      );
    }

    revalidatePath(`/clients/${clientId}/settings`);
    revalidatePath(`/clients/${clientId}/plan`);
    revalidatePath("/posts");

    const connectedPlatforms = hasIg ? "facebook,instagram" : "facebook";
    const igParam = `&ig_connected=${hasIg ? "true" : "false"}`;
    return NextResponse.redirect(
      targetUrl(`connected=${connectedPlatforms}${igParam}&oauth_success=1&platform=facebook`),
    );
  } catch (err: unknown) {
    console.error("[Facebook OAuth Callback] Internal callback failure:", err);
    const msg = err instanceof Error ? err.message : "failed";
    return NextResponse.redirect(
      targetUrl(`error=failed&oauth_error=${encodeURIComponent(msg)}&platform=facebook`),
    );
  }
}
