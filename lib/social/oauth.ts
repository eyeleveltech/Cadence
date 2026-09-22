import "server-only";
import type { Platform, TokenType } from "@prisma/client";

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
export type PlatformSlug = "instagram" | "instagram-direct" | "facebook" | "linkedin" | "youtube";

export const SLUG_TO_PLATFORM: Record<PlatformSlug, Platform> = {
  instagram: "INSTAGRAM",
  "instagram-direct": "INSTAGRAM",
  facebook: "FACEBOOK",
  linkedin: "LINKEDIN",
  youtube: "YOUTUBE",
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
};

export interface PlatformOAuthAdapter {
  isConfigured(): boolean;
  authorizeUrl(redirectUri: string, state: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<ExchangedToken>;
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

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? "v26.0";

/**
 * Meta — one app, one flow, covers both Facebook Pages and their linked
 * Instagram professional accounts. In development mode this works today
 * for the app's own admins/testers; going live for real clients is what
 * needs Meta App Review (the scopes below — pages_manage_posts,
 * instagram_content_publish — are exactly the review-gated ones).
 */
const meta: PlatformOAuthAdapter = {
  isConfigured: () => Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),

  authorizeUrl(redirectUri, state) {
    const params = new URLSearchParams({
      client_id: process.env.META_APP_ID!,
      redirect_uri: redirectUri,
      state,
      response_type: "code",
      scope: [
        "pages_show_list", "pages_read_engagement", "pages_manage_posts",
        "instagram_basic", "instagram_content_publish", "business_management",
      ].join(","),
    });
    return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const shortLived = new URLSearchParams({
      client_id: process.env.META_APP_ID!,
      client_secret: process.env.META_APP_SECRET!,
      redirect_uri: redirectUri,
      code,
    });
    const shortRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${shortLived}`);
    if (!shortRes.ok) throw new Error(`Meta token exchange failed: ${await shortRes.text()}`);
    const short = (await shortRes.json()) as { access_token: string };

    // Short-lived user token -> 60-day long-lived token, standard Meta hop.
    const exchange = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: process.env.META_APP_ID!,
      client_secret: process.env.META_APP_SECRET!,
      fb_exchange_token: short.access_token,
    });
    const longRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${exchange}`);
    if (!longRes.ok) throw new Error(`Meta long-lived token exchange failed: ${await longRes.text()}`);
    const long = (await longRes.json()) as { access_token: string; expires_in?: number };

    return {
      accessToken: long.access_token,
      expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : undefined,
    };
  },

  async listAccounts(token) {
    const pages = await fetchPages(token.accessToken);
    if (pages.length === 0) {
      throw new Error("No Facebook Page found for this account — connect a Page first.");
    }

    return pages.map((page) => ({
      externalAccountId: page.id,
      accountName: page.name,
      avatarUrl: page.picture?.data?.url,
      scopes: ["pages_manage_posts", "pages_read_engagement"],
      // The Page's own token, not the user token we authorized with.
      accessToken: page.access_token,
      tokenType: "PAGE" as TokenType,
    }));
  },
};

type MetaPage = {
  id: string;
  name: string;
  access_token: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string; username: string; profile_picture_url?: string };
};

/** One call gets the Pages, their per-Page tokens, and the Instagram
 * account linked to each — which is the only clean way to tie a client's
 * Instagram to their Facebook Page. */
async function fetchPages(userAccessToken: string): Promise<MetaPage[]> {
  const fields = "id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}";
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?fields=${encodeURIComponent(fields)}&access_token=${userAccessToken}`,
  );
  if (!res.ok) throw new Error(`Couldn't list Facebook Pages: ${await res.text()}`);
  const data = (await res.json()) as { data?: MetaPage[] };
  return data.data ?? [];
}

/**
 * Instagram publishing is reached through the same Meta app/token as
 * Facebook, but the account identity is the Page's linked Instagram
 * professional account, not the Page itself.
 */
const instagram: PlatformOAuthAdapter = {
  ...meta,
  async listAccounts(token) {
    const pages = await fetchPages(token.accessToken);
    if (pages.length === 0) {
      throw new Error("No Facebook Page found — Instagram publishing connects through a linked Page.");
    }

    // Publishing to Instagram is authorized by the *Page's* token, so
    // each IG account is carried by the Page it's linked to.
    const linked = pages.filter((page) => page.instagram_business_account);
    if (linked.length === 0) {
      throw new Error(
        "No Instagram professional account is linked to any of these Pages. Link one in Meta Business settings first.",
      );
    }

    return linked.map((page) => ({
      externalAccountId: page.instagram_business_account!.id,
      accountName: `@${page.instagram_business_account!.username}`,
      avatarUrl: page.instagram_business_account!.profile_picture_url,
      scopes: ["instagram_content_publish", "instagram_basic"],
      accessToken: page.access_token,
      tokenType: "PAGE" as TokenType,
    }));
  },
};

/**
 * LinkedIn — organization posting via the Community Management API.
 * The scopes below are exactly what's gated behind LinkedIn's partner
 * vetting; the calls are correct today but will 403 until that clears.
 */
const linkedin: PlatformOAuthAdapter = {
  isConfigured: () => Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),

  authorizeUrl(redirectUri, state) {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      redirect_uri: redirectUri,
      state,
      scope: "w_organization_social r_organization_social rw_organization_admin",
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
    const res = await fetch(
      "https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR",
      { headers: { Authorization: `Bearer ${token.accessToken}` } },
    );
    if (!res.ok) throw new Error(`Couldn't list LinkedIn organizations you administer: ${await res.text()}`);
    const data = (await res.json()) as { elements?: { organizationalTarget: string }[] };
    const elements = data.elements ?? [];
    if (elements.length === 0) throw new Error("No LinkedIn organization page found under this account.");

    // LinkedIn has no per-organization credential — every call uses the
    // member token, so each entry carries the same one.
    return Promise.all(
      elements.map(async (element) => {
        const orgId = element.organizationalTarget.split(":").pop()!;
        const orgRes = await fetch(`https://api.linkedin.com/v2/organizations/${orgId}`, {
          headers: { Authorization: `Bearer ${token.accessToken}` },
        });
        const name = orgRes.ok
          ? ((await orgRes.json()) as { localizedName?: string }).localizedName ?? `Organization ${orgId}`
          : `Organization ${orgId}`;

        return {
          externalAccountId: orgId,
          accountName: name,
          scopes: ["w_organization_social", "r_organization_social"],
          accessToken: token.accessToken,
          tokenType: "USER" as TokenType,
          expiresAt: token.expiresAt,
        };
      }),
    );
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
    // Instagram refuses a token under 24 hours old or already expired.
    // Not an error worth throwing over — the health check will mark the
    // connection and someone can reconnect by hand.
    if (!res.ok) return null;

    const data = (await res.json()) as { access_token: string; expires_in?: number };
    return {
      accessToken: data.access_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
    };
  },
};

const ADAPTERS: Record<PlatformSlug, PlatformOAuthAdapter> = {
  instagram,
  "instagram-direct": instagramDirect,
  facebook: meta,
  linkedin,
  youtube,
};

export function getOAuthAdapter(slug: PlatformSlug): PlatformOAuthAdapter {
  return ADAPTERS[slug];
}
