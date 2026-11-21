// Shared with the standalone worker process — no "server-only" guard.
import { prisma } from "../prisma";
import { encryptToken, decryptToken } from "../crypto";
import { redis } from "../queue";
import type { SocialAccount, Platform } from "@prisma/client";

const REFRESH_BUFFER_MS = 10 * 60 * 1000; // 10 minutes before expiry as specified in mastery prompt
const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? "v22.0";

export interface RefreshedToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

/**
 * Central token manager called before every publish job or API call.
 * Ensures the given client has an active connected SocialAccount for the platform,
 * refreshes expired or near-expiry tokens automatically, updates PostgreSQL, and
 * returns both the valid decrypted accessToken and the fresh SocialAccount record.
 */
export async function getValidClientToken(
  clientId: string,
  platform: Platform,
): Promise<{ accessToken: string; account: SocialAccount }> {
  const account = await prisma.socialAccount.findFirst({
    where: {
      clientId,
      platform,
      connectionStatus: "CONNECTED",
    },
  });

  if (!account) {
    const displayName = platform.charAt(0) + platform.slice(1).toLowerCase();
    throw new Error(`${displayName} account is not connected for this client. Please configure it in Settings.`);
  }

  const validToken = await getValidAccessToken(account);
  // Reload account in case tokens or status were updated during refresh
  const freshAccount = (await prisma.socialAccount.findUnique({ where: { id: account.id } })) ?? account;

  return { accessToken: validToken, account: freshAccount };
}

/**
 * Checks if a social account token is expired or expiring soon, and refreshes
 * it using the platform's OAuth 2.0 refresh endpoint if a refresh token is present.
 * Updates the encrypted tokens and expiry in Postgres, and returns the valid decrypted accessToken.
 */
export async function getValidAccessToken(account: SocialAccount): Promise<string> {
  let currentToken = "";
  try {
    currentToken = decryptToken(account.accessToken);
  } catch {
    currentToken = account.accessToken;
  }

  // Simulated accounts or test tokens do not require external HTTP refresh
  if (
    process.env.SOCIAL_DEV_SIMULATE === "1" ||
    currentToken.startsWith("sim_") ||
    currentToken === "simulated" ||
    currentToken === "mock" ||
    account.externalAccountId.startsWith("sandbox_") ||
    account.accountName.toLowerCase().includes("sandbox")
  ) {
    return currentToken;
  }

  // PAGE and SYSTEM_USER tokens (Meta Facebook Page / linked Instagram) do not expire
  if (account.tokenType === "PAGE" || account.tokenType === "SYSTEM_USER") {
    return currentToken;
  }

  // Check if token has an expiration date and whether it's still comfortably valid
  const expiresAt = account.tokenExpiresAt ? new Date(account.tokenExpiresAt).getTime() : null;
  const now = Date.now();

  if (expiresAt && expiresAt - now > REFRESH_BUFFER_MS) {
    // Token is still valid
    return currentToken;
  }

  // Token is expired or expiring within 10 minutes — attempt refresh
  let decryptedRefreshToken = "";
  if (account.refreshToken) {
    try {
      decryptedRefreshToken = decryptToken(account.refreshToken);
    } catch {
      decryptedRefreshToken = account.refreshToken;
    }
  }

  // Redis mutex lock for X/Twitter where refresh tokens rotate on every single use
  let acquiredLock = false;
  const lockKey = `lock:refresh:${account.id}`;
  if (account.platform === "TWITTER") {
    try {
      const lockRes = await Promise.race([
        redis.set(lockKey, "1", "PX", 15000, "NX"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("redis timeout")), 500)),
      ]);
      if (!lockRes) {
        // Another worker is actively refreshing this token; wait briefly then reload fresh token from DB
        await new Promise((r) => setTimeout(r, 1500));
        const refreshedAccount = await prisma.socialAccount.findUnique({ where: { id: account.id } });
        if (refreshedAccount) {
          return decryptToken(refreshedAccount.accessToken);
        }
      } else {
        acquiredLock = true;
      }
    } catch {
      // In-memory fallback if Redis is unavailable or times out
    }
  }

  try {
    const refreshed = await exchangeRefreshToken(account.platform, decryptedRefreshToken, currentToken);
    if (!refreshed) {
      return currentToken;
    }

    await prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        accessToken: encryptToken(refreshed.accessToken),
        ...(refreshed.refreshToken ? { refreshToken: encryptToken(refreshed.refreshToken) } : {}),
        tokenExpiresAt: refreshed.expiresAt ?? null,
        connectionStatus: "CONNECTED",
        statusDetail: null,
        lastHealthCheckAt: new Date(),
      },
    });

    return refreshed.accessToken;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[tokens] Failed to refresh token for account ${account.id} (${account.platform}):`, errMsg);

    await prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        connectionStatus: "NEEDS_RECONNECT",
        statusDetail: `Token refresh failed: ${errMsg}`,
        lastHealthCheckAt: new Date(),
      },
    }).catch(() => {});

    return currentToken;
  } finally {
    if (acquiredLock) {
      await redis.del(lockKey).catch(() => {});
    }
  }
}

/**
 * Platform-specific OAuth 2.0 token refresh logic.
 */
export async function exchangeRefreshToken(
  platform: Platform,
  refreshToken: string,
  currentToken: string,
): Promise<RefreshedToken | null> {
  switch (platform) {
    case "TWITTER": {
      const clientId = process.env.TWITTER_CLIENT_ID;
      const clientSecret = process.env.TWITTER_CLIENT_SECRET;
      if (!clientId || !clientSecret) return null;

      const res = await fetch("https://api.twitter.com/2/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: clientId,
        }),
      });

      if (!res.ok) {
        throw new Error(`Twitter refresh failed: ${await res.text()}`);
      }

      const data = (await res.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      };
    }

    case "YOUTUBE": {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) return null;

      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (!res.ok) {
        throw new Error(`Google YouTube refresh failed: ${await res.text()}`);
      }

      const data = (await res.json()) as {
        access_token: string;
        expires_in?: number;
      };

      return {
        accessToken: data.access_token,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      };
    }

    case "LINKEDIN": {
      const clientId = process.env.LINKEDIN_CLIENT_ID;
      const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
      if (!clientId || !clientSecret) return null;

      const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      if (!res.ok) {
        throw new Error(`LinkedIn refresh failed: ${await res.text()}`);
      }

      const data = (await res.json()) as {
        access_token: string;
        expires_in?: number;
        refresh_token?: string;
      };

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      };
    }

    case "INSTAGRAM":
    case "FACEBOOK": {
      // 1. If Meta Facebook App credentials exist, attempt Meta 60-day token refresh
      if (process.env.META_APP_ID && process.env.META_APP_SECRET) {
        const params = new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: process.env.META_APP_ID,
          client_secret: process.env.META_APP_SECRET,
          fb_exchange_token: currentToken,
        });
        const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${params}`);
        if (metaRes.ok) {
          const data = (await metaRes.json()) as { access_token: string; expires_in?: number };
          return {
            accessToken: data.access_token,
            expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
          };
        }
      }

      // 2. Otherwise if Instagram direct login (60-day token refresh)
      const res = await fetch(
        `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${currentToken}`,
      );
      if (!res.ok) return null;

      const data = (await res.json()) as {
        access_token: string;
        expires_in?: number;
      };

      return {
        accessToken: data.access_token,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      };
    }

    default:
      return null;
  }
}
