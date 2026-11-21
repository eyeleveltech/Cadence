// Shared with the standalone worker process — no "server-only" guard.
import type { Platform as PrismaPlatform, TokenType } from "@prisma/client";

type Platform = PrismaPlatform | "TWITTER";

/**
 * Instagram has two of these because Meta offers two entirely separate
 * ways in, and which one a client can use depends on how their account
 * is set up:
 *
 *  - "instagram"        — Instagram API with Facebook Login. Reaches IG
 *                         *through* a linked Facebook Page. Needs the
 *                         client to have a Page.
 *  - "instagram-direct" — Instagram API with Instagram Login. The client
 *                         signs in with Instagram itself. No Page needed.
 *
 * Both land on Platform.INSTAGRAM, so a given account can only ever be
 * connected once either way — the unique index on
 * (platform, externalAccountId) sees to that.
 */
export type PlatformSlug = "instagram" | "instagram-direct" | "facebook" | "linkedin" | "youtube" | "twitter";

export const SLUG_TO_PLATFORM: Record<PlatformSlug, Platform> = {
  instagram: "INSTAGRAM",
  "instagram-direct": "INSTAGRAM",
  facebook: "FACEBOOK",
  linkedin: "LINKEDIN",
  youtube: "YOUTUBE",
  twitter: "TWITTER",
};

export function isPlatformSlug(value: string): value is PlatformSlug {
  return value in SLUG_TO_PLATFORM;
}

export type ExchangedToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
};

export type DiscoveredAccount = {
  externalAccountId: string;
  accountName: string;
  scopes: string[];
  avatarUrl?: string;
  /**
   * The credential to store for *this specific asset*, which is not
   * always the user token we authorized with.
   *
   * Meta hands back a separate access_token per Page, and that is what
   * publishing to the Page requires — a Page token derived from a
   * long-lived user token also doesn't expire, which is why it's the one
   * worth keeping. LinkedIn and Google have no per-asset equivalent, so
   * they reuse the user token.
   */
  accessToken: string;
  tokenType: TokenType;
  /** Only meaningful for USER tokens; PAGE and SYSTEM_USER don't expire. */
  expiresAt?: Date;
  linkedInstagram?: { id: string; username: string; profile_picture_url?: string };
  linkedFacebookPage?: { id: string; name: string; avatarUrl?: string; access_token: string };
};

export interface PlatformOAuthAdapter {
  isConfigured(): boolean;
  authorizeUrl(redirectUri: string, state: string, options?: { codeChallenge?: string; scopes?: string[] }): string;
  exchangeCode(code: string, redirectUri: string, options?: { codeVerifier?: string }): Promise<ExchangedToken>;
  /**
   * Every asset this token can publish to — not just the first one.
   *
   * This used to be discoverAccount(), returning data[0]. With Business
   * Manager partner access one agency login administers every client's
   * Page, so "the first one Meta returns" is a coin flip between brands:
   * connecting Instagram for TNPA could silently bind Right Hospitals'
   * account. The caller picks.
   */
  listAccounts(token: ExchangedToken): Promise<DiscoveredAccount[]>;
  /**
   * Trade a long-lived token in for a fresh one, where the platform
   * allows it. Instagram's direct login is the only one here that does —
   * which is what keeps a 60-day token alive without dragging the client
   * back through a consent screen four times a year.
   */
  refreshAccessToken?(currentToken: string): Promise<ExchangedToken | null>;
}

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? "v22.0";

/**
 * Meta — one app, one flow, covers both Facebook Pages and their linked
 * Instagram professional accounts. In development mode this works today
 * for the app's own admins/testers; going live for real clients is what
 * needs Meta App Review (the scopes below — pages_manage_posts,
 * instagram_content_publish — are exactly the review-gated ones).
 */
const meta: PlatformOAuthAdapter = {
  isConfigured: () => Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),

  authorizeUrl(redirectUri, state, options) {
    const defaultScopes = [
      "public_profile",
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "instagram_basic",
      "instagram_content_publish",
      "business_management",
    ];
    const scopes = options?.scopes && options.scopes.length > 0
      ? options.scopes
      : process.env.FACEBOOK_OAUTH_SCOPES
        ? process.env.FACEBOOK_OAUTH_SCOPES.split(",").map((s) => s.trim()).filter(Boolean)
        : process.env.META_OAUTH_SCOPES
          ? process.env.META_OAUTH_SCOPES.split(",").map((s) => s.trim()).filter(Boolean)
          : defaultScopes;

    const params = new URLSearchParams({
      client_id: process.env.META_APP_ID!,
      redirect_uri: redirectUri,
      state,
      response_type: "code",
      auth_type: "rerequest",
      scope: scopes.join(","),
    });
    return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    console.log(`[meta:exchangeCode] Exchanging short-lived code (${code.slice(0, 10)}...) with redirectUri: ${redirectUri}`);
    const shortLived = new URLSearchParams({
      client_id: process.env.META_APP_ID!,
      client_secret: process.env.META_APP_SECRET!,
      redirect_uri: redirectUri,
      code,
    });
    const shortRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${shortLived}`);
    if (!shortRes.ok) {
      const errText = await shortRes.text();
      console.error(`[meta:exchangeCode] Short-lived token exchange failed (${shortRes.status}):`, errText);
      throw new Error(`Meta token exchange failed: ${errText}`);
    }
    const short = (await shortRes.json()) as { access_token: string; expires_in?: number };
    console.log(`[meta:exchangeCode] Successfully received short-lived token: ${short.access_token.slice(0, 12)}... (expires_in: ${short.expires_in ?? "N/A"})`);

    // Short-lived user token -> 60-day long-lived token, standard Meta hop.
    console.log(`[meta:exchangeCode] Exchanging short-lived token for 60-day long-lived token (grant_type=fb_exchange_token)...`);
    const exchange = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: process.env.META_APP_ID!,
      client_secret: process.env.META_APP_SECRET!,
      fb_exchange_token: short.access_token,
    });
    const longRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${exchange}`);
    if (!longRes.ok) {
      const errText = await longRes.text();
      console.error(`[meta:exchangeCode] Long-lived token exchange failed (${longRes.status}):`, errText);
      throw new Error(`Meta long-lived token exchange failed: ${errText}`);
    }
    const long = (await longRes.json()) as { access_token: string; expires_in?: number };
    console.log(`[meta:exchangeCode] Successfully received 60-day long-lived token: ${long.access_token.slice(0, 12)}... (expires_in: ${long.expires_in ?? "N/A"})`);

    return {
      accessToken: long.access_token,
      expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : undefined,
    };
  },

  async listAccounts(token) {
    const pages = await fetchPages(token.accessToken);
    if (pages.length === 0) {
      console.warn("[meta:listAccounts] No Facebook Pages found under this user account.");
      return [];
    }

    return pages.map((page) => ({
      externalAccountId: page.id,
      accountName: page.name,
      avatarUrl: page.picture?.data?.url,
      scopes: ["pages_manage_posts", "pages_read_engagement"],
      // The Page's own token, not the user token we authorized with.
      accessToken: page.access_token,
      tokenType: "PAGE" as TokenType,
      linkedInstagram: page.instagram_business_account
        ? {
            id: page.instagram_business_account.id,
            username: page.instagram_business_account.username,
            profile_picture_url: page.instagram_business_account.profile_picture_url,
          }
        : undefined,
    }));
  },
};

type MetaPage = {
  id: string;
  name: string;
  access_token: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string; username: string; name?: string; profile_picture_url?: string };
};

/** One call gets the Pages, their per-Page tokens, and the Instagram
 * account linked to each — which is the only clean way to tie a client's
 * Instagram to their Facebook Page. Checks /me/businesses if /me/accounts is empty. */
async function fetchPages(userAccessToken: string): Promise<MetaPage[]> {
  const pageFields = "id,name,access_token,category,tasks";
  console.log(`[meta:fetchPages] Requesting /me/accounts via Graph API ${GRAPH_VERSION}...`);
  let pages: MetaPage[] = [];

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?fields=${pageFields}&limit=100&access_token=${userAccessToken}`,
    );
    if (res.ok) {
      const data = (await res.json()) as { data?: MetaPage[] };
      pages = data.data ?? [];
      console.log(`[meta:fetchPages] /me/accounts returned ${pages.length} page(s):`, pages.map((p) => ({ id: p.id, name: p.name })));
    } else {
      const errText = await res.text();
      console.warn(`[meta:fetchPages] /me/accounts failed (${res.status}):`, errText);
    }
  } catch (err) {
    console.warn("[meta:fetchPages] /me/accounts network error:", err);
  }

  // Fallback 1: Query /me?fields=accounts{...}
  if (pages.length === 0) {
    console.log(`[meta:fetchPages] /me/accounts returned 0 pages. Trying /me?fields=accounts fallback...`);
    try {
      const meRes = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/me?fields=id,name,accounts{id,name,access_token,category,tasks}&access_token=${userAccessToken}`,
      );
      if (meRes.ok) {
        const meData = (await meRes.json()) as { accounts?: { data?: MetaPage[] } };
        if (meData.accounts?.data && meData.accounts.data.length > 0) {
          pages = meData.accounts.data;
          console.log(`[meta:fetchPages] /me?fields=accounts returned ${pages.length} page(s).`);
        }
      }
    } catch (meErr) {
      console.warn("[meta:fetchPages] /me?fields=accounts fallback error:", meErr);
    }
  }

  // Fallback 2: Check Meta Business Portfolios (/me/businesses)
  if (pages.length === 0) {
    console.log(`[meta:fetchPages] Still 0 pages. Checking Meta Business Portfolios (/me/businesses)...`);
    try {
      const bizRes = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/me/businesses?fields=id,name,client_pages{id,name,access_token},owned_pages{id,name,access_token}&access_token=${userAccessToken}`,
      );
      if (bizRes.ok) {
        const bizData = (await bizRes.json()) as {
          data?: Array<{
            id: string;
            name?: string;
            owned_pages?: { data?: MetaPage[] };
            client_pages?: { data?: MetaPage[] };
          }>;
        };
        const businesses = bizData.data ?? [];
        console.log(`[meta:fetchPages] /me/businesses returned ${businesses.length} portfolio(s):`, businesses.map((b) => ({ id: b.id, name: b.name })));
        for (const biz of businesses) {
          if (biz.owned_pages?.data && biz.owned_pages.data.length > 0) {
            console.log(`[meta:fetchPages] Found ${biz.owned_pages.data.length} owned_page(s) in business ${biz.id}`);
            pages = [...pages, ...biz.owned_pages.data];
          }
          if (biz.client_pages?.data && biz.client_pages.data.length > 0) {
            console.log(`[meta:fetchPages] Found ${biz.client_pages.data.length} client_page(s) in business ${biz.id}`);
            pages = [...pages, ...biz.client_pages.data];
          }

          // Fallback sub-requests if nested objects were omitted
          if (!biz.owned_pages?.data && !biz.client_pages?.data) {
            try {
              const ownedRes = await fetch(
                `https://graph.facebook.com/${GRAPH_VERSION}/${biz.id}/owned_pages?fields=${encodeURIComponent(pageFields)}&access_token=${userAccessToken}`,
              );
              if (ownedRes.ok) {
                const op = (await ownedRes.json()) as { data?: MetaPage[] };
                if (op.data && op.data.length > 0) {
                  console.log(`[meta:fetchPages] Fetched ${op.data.length} owned_page(s) via /${biz.id}/owned_pages`);
                  pages = [...pages, ...op.data];
                }
              }
              const clientRes = await fetch(
                `https://graph.facebook.com/${GRAPH_VERSION}/${biz.id}/client_pages?fields=${encodeURIComponent(pageFields)}&access_token=${userAccessToken}`,
              );
              if (clientRes.ok) {
                const cp = (await clientRes.json()) as { data?: MetaPage[] };
                if (cp.data && cp.data.length > 0) {
                  console.log(`[meta:fetchPages] Fetched ${cp.data.length} client_page(s) via /${biz.id}/client_pages`);
                  pages = [...pages, ...cp.data];
                }
              }
            } catch (innerErr) {
              console.warn(`[meta:fetchPages] Error querying pages for business ${biz.id}:`, innerErr);
            }
          }
        }
      } else {
        const bizErr = await bizRes.text();
        console.warn(`[meta:fetchPages] /me/businesses failed (${bizRes.status}):`, bizErr);
      }
    } catch (err) {
      console.warn("[meta:fetchPages] Failed to fetch /me/businesses:", err);
    }
  }

  // Deduplicate pages by page ID
  const seen = new Set<string>();
  const uniquePages = pages.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  // Ensure every discovered Page has its Page Access Token resolved
  for (const page of uniquePages) {
    if (!page.access_token) {
      try {
        console.log(`[meta:fetchPages] Page ${page.id} (${page.name}) missing access_token. Fetching via /${page.id}...`);
        const pageRes = await fetch(
          `https://graph.facebook.com/${GRAPH_VERSION}/${page.id}?fields=access_token&access_token=${userAccessToken}`,
        );
        if (pageRes.ok) {
          const pageData = (await pageRes.json()) as { access_token?: string };
          if (pageData.access_token) {
            page.access_token = pageData.access_token;
            console.log(`[meta:fetchPages] Successfully fetched Page Access Token for ${page.id}`);
          }
        }
      } catch (tokenErr) {
        console.warn(`[meta:fetchPages] Failed to fetch Page Access Token for ${page.id}:`, tokenErr);
      }
    }
  }

  console.log(`[meta:fetchPages] Total unique Facebook Pages discovered: ${uniquePages.length}`);
  return uniquePages;
}

/**
 * Instagram Unified Login adapter — uses Meta dialog with channel: 'IG_API_ONBOARDING'
 * and queries assigned_instagram_accounts directly, freeing Instagram from requiring a Facebook Page.
 */
const instagram: PlatformOAuthAdapter = {
  isConfigured: () => Boolean((process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID) && (process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET)),

  authorizeUrl(redirectUri, state, options) {
    const appId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID!;
    const scopes = options?.scopes && options.scopes.length > 0
      ? options.scopes
      : [
          "instagram_basic",
          "instagram_content_publish",
          "business_management",
        ];

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      state,
      response_type: "code",
      scope: scopes.join(","),
      extras: JSON.stringify({ setup: { channel: "IG_API_ONBOARDING" } }),
    });
    return `https://www.facebook.com/v22.0/dialog/oauth?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const appId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID!;
    const appSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET!;
    const shortLived = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });
    const shortRes = await fetch(`https://graph.facebook.com/v22.0/oauth/access_token?${shortLived}`);
    if (!shortRes.ok) throw new Error(`Instagram token exchange failed: ${await shortRes.text()}`);
    const short = (await shortRes.json()) as { access_token: string; expires_in?: number };

    // Exchange for 60-day token
    let accessToken = short.access_token;
    let expiresAt = short.expires_in ? new Date(Date.now() + short.expires_in * 1000) : undefined;
    try {
      const exchange = new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: short.access_token,
      });
      const longRes = await fetch(`https://graph.facebook.com/v22.0/oauth/access_token?${exchange}`);
      if (longRes.ok) {
        const long = (await longRes.json()) as { access_token: string; expires_in?: number };
        accessToken = long.access_token;
        if (long.expires_in) {
          expiresAt = new Date(Date.now() + long.expires_in * 1000);
        }
      }
    } catch {}

    return {
      accessToken,
      expiresAt,
    };
  },

  async listAccounts(token) {
    // 1. Unified login: query assigned_instagram_accounts directly
    try {
      const assignedRes = await fetch(
        `https://graph.facebook.com/v22.0/me/assigned_instagram_accounts?fields=id,username,name,profile_picture_url&access_token=${token.accessToken}`,
      );
      if (assignedRes.ok) {
        const assignedData = (await assignedRes.json()) as {
          data?: Array<{ id: string; username?: string; name?: string; profile_picture_url?: string }>;
        };
        if (assignedData.data && assignedData.data.length > 0) {
          return assignedData.data.map((acc) => ({
            externalAccountId: acc.id,
            accountName: `@${(acc.username || acc.name || "instagram").replace(/^@+/, "")}`,
            avatarUrl: acc.profile_picture_url,
            scopes: ["instagram_basic", "instagram_content_publish", "business_management"],
            accessToken: token.accessToken,
            tokenType: "USER" as TokenType,
            expiresAt: token.expiresAt,
          }));
        }
      }
    } catch (err) {
      console.warn("[instagram:listAccounts] Error checking assigned_instagram_accounts:", err);
    }

    // 2. Query /me fallback
    try {
      const meRes = await fetch(
        `https://graph.facebook.com/v22.0/me?fields=id,username,name,profile_picture_url&access_token=${token.accessToken}`,
      );
      if (meRes.ok) {
        const me = (await meRes.json()) as { id: string; username?: string; name?: string; profile_picture_url?: string };
        if (me.id) {
          return [{
            externalAccountId: me.id,
            accountName: `@${(me.username || me.name || "instagram").replace(/^@+/, "")}`,
            avatarUrl: me.profile_picture_url,
            scopes: ["instagram_basic", "instagram_content_publish", "business_management"],
            accessToken: token.accessToken,
            tokenType: "USER" as TokenType,
            expiresAt: token.expiresAt,
          }];
        }
      }
    } catch (err) {
      console.warn("[instagram:listAccounts] Error checking /me:", err);
    }

    // 3. Fallback: check linked pages if present
    const pages = await fetchPages(token.accessToken);
    const linked = pages.filter((page) => page.instagram_business_account);
    return linked.map((page) => ({
      externalAccountId: page.instagram_business_account!.id,
      accountName: `@${page.instagram_business_account!.username.replace(/^@+/, "")}`,
      avatarUrl: page.instagram_business_account!.profile_picture_url,
      scopes: ["instagram_content_publish", "instagram_basic"],
      accessToken: page.access_token,
      tokenType: "PAGE" as TokenType,
      linkedFacebookPage: {
        id: page.id,
        name: page.name,
        avatarUrl: page.picture?.data?.url,
        access_token: page.access_token,
      },
    }));
  },
};

/**
 * LinkedIn — personal profile and organization OAuth.
 * Personal profile posting uses OpenID Connect with w_member_social.
 * (Placeholder reserved for LINKEDIN_COMPANY_CLIENT_ID / LINKEDIN_COMPANY_CLIENT_SECRET
 * for organization pages once partner vetting clears).
 */
const linkedin: PlatformOAuthAdapter = {
  isConfigured: () => Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),

  authorizeUrl(redirectUri, state) {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      redirect_uri: redirectUri,
      state,
      scope: "openid profile email w_member_social",
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    });
    const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`LinkedIn token exchange failed: ${await res.text()}`);
    const data = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  },

  async listAccounts(token) {
    // ── Placeholder for LinkedIn Company Pages (w_organization_social) ──
    // When approved, LINKEDIN_COMPANY_CLIENT_ID / LINKEDIN_COMPANY_CLIENT_SECRET
    // will query /v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR.

    // ── Personal Member Profile (w_member_social) via OpenID Connect ──
    const res = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`LinkedIn userinfo lookup failed: ${await res.text()}`);
    }
    const info = (await res.json()) as {
      sub: string;
      name?: string;
      given_name?: string;
      family_name?: string;
      picture?: string;
      email?: string;
    };

    if (!info.sub) {
      throw new Error("LinkedIn userinfo did not return a member ID (sub).");
    }

    const displayName =
      info.name ||
      [info.given_name, info.family_name].filter(Boolean).join(" ") ||
      `LinkedIn Member (${info.sub})`;

    return [
      {
        externalAccountId: info.sub,
        accountName: displayName,
        avatarUrl: info.picture,
        scopes: ["openid", "profile", "email", "w_member_social"],
        accessToken: token.accessToken,
        tokenType: "USER" as TokenType,
        expiresAt: token.expiresAt,
      },
    ];
  },
};

/** YouTube — plain Google OAuth, the one platform here that doesn't
 * gate behind a review process before a channel can connect. */
const youtube: PlatformOAuthAdapter = {
  isConfigured: () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),

  authorizeUrl(redirectUri, state) {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      state,
      scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    });
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
    const data = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  },

  async listAccounts(token) {
    const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });
    if (!res.ok) throw new Error(`Couldn't look up the YouTube channel: ${await res.text()}`);
    const data = (await res.json()) as {
      items?: { id: string; snippet: { title: string; thumbnails?: { default?: { url?: string } } } }[];
    };
    const items = data.items ?? [];
    if (items.length === 0) throw new Error("No YouTube channel found on this Google account.");

    // Google refreshes rather than issuing per-channel tokens, so the
    // refresh token on the connection is what keeps this alive.
    return items.map((channel) => ({
      externalAccountId: channel.id,
      accountName: channel.snippet.title,
      avatarUrl: channel.snippet.thumbnails?.default?.url,
      scopes: ["youtube.upload", "youtube.readonly"],
      accessToken: token.accessToken,
      tokenType: "USER" as TokenType,
      expiresAt: token.expiresAt,
    }));
  },
};


/**
 * Instagram API with Instagram Login ("Business Login for Instagram").
 *
 * The client signs in with their Instagram account directly — no
 * Facebook Page, no Business Manager, no partner access. For a client
 * whose Instagram was never linked to a Page, this is the only way in.
 *
 * Note the credentials: this uses the *Instagram* App ID and Secret from
 * the app dashboard's Instagram section, which are different values from
 * META_APP_ID/META_APP_SECRET even within the same app.
 */
const instagramDirect: PlatformOAuthAdapter = {
  isConfigured: () => Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET),

  authorizeUrl(redirectUri, state) {
    const params = new URLSearchParams({
      client_id: process.env.INSTAGRAM_APP_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
      scope: [
        "instagram_business_basic",
        "instagram_business_content_publish",
        "instagram_business_manage_comments",
      ].join(","),
    });
    return `https://www.instagram.com/oauth/authorize?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    // Unlike the Meta flow this is a POST with a form body, and it comes
    // back short-lived — about an hour.
    const body = new URLSearchParams({
      client_id: process.env.INSTAGRAM_APP_ID!,
      client_secret: process.env.INSTAGRAM_APP_SECRET!,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    });
    const res = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`Instagram token exchange failed: ${await res.text()}`);
    const short = (await res.json()) as { access_token: string; user_id?: string | number };

    // Second hop to a 60-day token. Skipping it would leave the
    // connection dead within the hour.
    const exchange = new URLSearchParams({
      grant_type: "ig_exchange_token",
      client_secret: process.env.INSTAGRAM_APP_SECRET!,
      access_token: short.access_token,
    });
    const longRes = await fetch(`https://graph.instagram.com/access_token?${exchange}`);
    if (!longRes.ok) throw new Error(`Instagram long-lived exchange failed: ${await longRes.text()}`);
    const long = (await longRes.json()) as { access_token: string; expires_in?: number };

    return {
      accessToken: long.access_token,
      expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : undefined,
    };
  },

  async listAccounts(token) {
    const res = await fetch(
      `https://graph.instagram.com/v23.0/me?fields=user_id,username,profile_picture_url&access_token=${token.accessToken}`,
    );
    if (!res.ok) throw new Error(`Couldn't read the Instagram account: ${await res.text()}`);
    const me = (await res.json()) as {
      user_id?: string;
      id?: string;
      username?: string;
      profile_picture_url?: string;
    };

    const id = me.user_id ?? me.id;
    if (!id) throw new Error("Instagram didn't return an account id for this login.");

    // This login is one account, so there is nothing to choose between —
    // the callback's single-account path saves it directly.
    return [{
      externalAccountId: String(id),
      accountName: me.username ? `@${me.username}` : "Instagram account",
      avatarUrl: me.profile_picture_url,
      scopes: ["instagram_business_basic", "instagram_business_content_publish"],
      accessToken: token.accessToken,
      tokenType: "USER" as TokenType,
      expiresAt: token.expiresAt,
    }];
  },

  async refreshAccessToken(currentToken) {
    const params = new URLSearchParams({
      grant_type: "ig_refresh_token",
      access_token: currentToken,
    });
    const res = await fetch(`https://graph.instagram.com/refresh_access_token?${params}`);
    if (!res.ok) return null;

    const data = (await res.json()) as { access_token: string; expires_in?: number };
    return {
      accessToken: data.access_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
    };
  },
};

const twitterOAuth: PlatformOAuthAdapter = {
  isConfigured() {
    return Boolean(
      (process.env.TWITTER_CLIENT_ID || process.env.X_CLIENT_ID) &&
      (process.env.TWITTER_CLIENT_SECRET || process.env.X_CLIENT_SECRET)
    );
  },

  authorizeUrl(redirectUri: string, state: string, options?: { codeChallenge?: string; scopes?: string[] }): string {
    const clientId = process.env.TWITTER_CLIENT_ID || process.env.X_CLIENT_ID || "QVN1YkNqRjBtVXU5V3BDTGlNTX2k6MTpjaQ";
    const codeChallenge = options?.codeChallenge;
    if (!codeChallenge) {
      throw new Error("RFC 7636 S256 code_challenge is required for Twitter OAuth authorization");
    }
    const scopes = options?.scopes?.length
      ? options.scopes.join(" ")
      : "tweet.read tweet.write users.read offline.access";
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  },

  async exchangeCode(code: string, redirectUri: string, options?: { codeVerifier?: string }): Promise<ExchangedToken> {
    const clientId = process.env.TWITTER_CLIENT_ID || process.env.X_CLIENT_ID || "";
    const clientSecret = process.env.TWITTER_CLIENT_SECRET || process.env.X_CLIENT_SECRET || "";
    const codeVerifier = options?.codeVerifier;
    if (!codeVerifier) {
      throw new Error("RFC 7636 code_verifier is required for Twitter token exchange");
    }
    const res = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });
    if (!res.ok) {
      throw new Error(`X (Twitter) token exchange failed: ${await res.text()}`);
    }
    const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
    };
  },

  async listAccounts(token: ExchangedToken): Promise<DiscoveredAccount[]> {
    const res = await fetch("https://api.twitter.com/2/users/me?user.fields=profile_image_url", {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });
    if (!res.ok) {
      return [{
        externalAccountId: "twitter_me",
        accountName: "X (Twitter) Account",
        avatarUrl: undefined,
        scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
        tokenType: "USER",
        accessToken: token.accessToken,
        expiresAt: token.expiresAt,
      }];
    }
    const { data } = (await res.json()) as { data: { id: string; name: string; username: string; profile_image_url?: string } };
    return [{
      externalAccountId: data.id,
      accountName: `@${data.username}`,
      avatarUrl: data.profile_image_url ?? undefined,
      scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
      tokenType: "USER",
      accessToken: token.accessToken,
      expiresAt: token.expiresAt,
    }];
  },
};

const ADAPTERS: Record<PlatformSlug, PlatformOAuthAdapter> = {
  instagram,
  "instagram-direct": instagramDirect,
  facebook: meta,
  linkedin,
  youtube,
  twitter: twitterOAuth,
};

export function getOAuthAdapter(slug: PlatformSlug): PlatformOAuthAdapter {
  return ADAPTERS[slug];
}
