import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getValidAccessToken } from "./tokens";
import { encryptToken } from "../crypto";
import { prisma } from "../prisma";
import { redis } from "../queue";
import type { SocialAccount } from "@prisma/client";

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = "test-encryption-key-for-testing-only-32b!";
  process.env.TWITTER_CLIENT_ID = "mock-twitter-id";
  process.env.TWITTER_CLIENT_SECRET = "mock-twitter-secret";
  process.env.GOOGLE_CLIENT_ID = "mock-google-id";
  process.env.GOOGLE_CLIENT_SECRET = "mock-google-secret";
  delete process.env.SOCIAL_DEV_SIMULATE;
  vi.restoreAllMocks();
  vi.spyOn(redis, "set").mockResolvedValue("OK" as never);
  vi.spyOn(redis, "del").mockResolvedValue(1 as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createTestAccount(overrides?: Partial<SocialAccount>): SocialAccount {
  return {
    id: "sa-1",
    clientId: "client-1",
    platform: "TWITTER",
    accountName: "@CadenceDev",
    avatarUrl: null,
    externalAccountId: "11223344",
    accessToken: encryptToken("initial-valid-access-token"),
    refreshToken: encryptToken("valid-refresh-token"),
    tokenType: "USER",
    tokenExpiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour in future
    connectionStatus: "CONNECTED",
    statusDetail: null,
    lastHealthCheckAt: new Date(),
    scopes: ["tweet.read", "tweet.write"],
    connectedById: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("Token Auto-Refresh Utility (lib/social/tokens.ts)", () => {
  it("returns decrypted accessToken directly if not expired and beyond refresh buffer", async () => {
    const account = createTestAccount();
    const token = await getValidAccessToken(account);
    expect(token).toBe("initial-valid-access-token");
  });

  it("short-circuits and returns plain token when SOCIAL_DEV_SIMULATE=1", async () => {
    process.env.SOCIAL_DEV_SIMULATE = "1";
    const account = createTestAccount({
      accessToken: "sim_token_xyz",
      tokenExpiresAt: new Date(Date.now() - 1000), // expired
    });
    const token = await getValidAccessToken(account);
    expect(token).toBe("sim_token_xyz");
  });

  it("refreshes expired Twitter access token and updates Postgres", async () => {
    const expiredDate = new Date(Date.now() - 60 * 1000); // 1 minute ago
    const account = createTestAccount({
      platform: "TWITTER",
      tokenExpiresAt: expiredDate,
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "new-refreshed-twitter-token",
          refresh_token: "new-twitter-refresh-token",
          expires_in: 7200,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const updateSpy = vi.spyOn(prisma.socialAccount, "update").mockResolvedValue({} as never);

    const token = await getValidAccessToken(account);

    expect(token).toBe("new-refreshed-twitter-token");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.twitter.com/2/oauth2/token",
      expect.objectContaining({ method: "POST" }),
    );
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sa-1" },
        data: expect.objectContaining({
          connectionStatus: "CONNECTED",
        }),
      }),
    );
  });

  it("refreshes expired YouTube access token and updates Postgres", async () => {
    const expiredDate = new Date(Date.now() - 60 * 1000);
    const account = createTestAccount({
      platform: "YOUTUBE",
      tokenExpiresAt: expiredDate,
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "new-refreshed-google-token",
          expires_in: 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const updateSpy = vi.spyOn(prisma.socialAccount, "update").mockResolvedValue({} as never);

    const token = await getValidAccessToken(account);

    expect(token).toBe("new-refreshed-google-token");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({ method: "POST" }),
    );
    expect(updateSpy).toHaveBeenCalled();
  });

  it("marks connectionStatus=NEEDS_RECONNECT when refresh fails", async () => {
    const expiredDate = new Date(Date.now() - 60 * 1000);
    const account = createTestAccount({
      platform: "TWITTER",
      tokenExpiresAt: expiredDate,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Invalid refresh token", { status: 400 }),
    );

    const updateSpy = vi.spyOn(prisma.socialAccount, "update").mockResolvedValue({} as never);

    const token = await getValidAccessToken(account);

    expect(token).toBe("initial-valid-access-token"); // returns existing as fallback
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sa-1" },
        data: expect.objectContaining({
          connectionStatus: "NEEDS_RECONNECT",
        }),
      }),
    );
  });
});
