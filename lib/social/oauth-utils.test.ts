import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getOAuthRedirectUri, getBaseUrl, getSafeRedirectUrl } from "./oauth-utils";

describe("OAuth URL & Redirect Utilities (lib/social/oauth-utils.ts)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves development base URL fallback to localhost:3000", () => {
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("NODE_ENV", "development");

    expect(getBaseUrl()).toBe("http://localhost:3000");
    expect(getOAuthRedirectUri("twitter")).toBe("http://localhost:3000/api/oauth/twitter/callback");
  });

  it("resolves production fallback to https://cadence.theeyelevelstudio.com when BETTER_AUTH_URL is omitted", () => {
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("NODE_ENV", "production");

    expect(getBaseUrl()).toBe("https://cadence.theeyelevelstudio.com");
    expect(getOAuthRedirectUri("facebook")).toBe(
      "https://cadence.theeyelevelstudio.com/api/oauth/facebook/callback"
    );
  });

  it("prioritizes BETTER_AUTH_URL and strips any trailing slash", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://cadence.theeyelevelstudio.com/");
    vi.stubEnv("NODE_ENV", "production");

    expect(getBaseUrl()).toBe("https://cadence.theeyelevelstudio.com");
    expect(getOAuthRedirectUri("linkedin")).toBe(
      "https://cadence.theeyelevelstudio.com/api/oauth/linkedin/callback"
    );
    expect(getOAuthRedirectUri("youtube")).toBe(
      "https://cadence.theeyelevelstudio.com/api/oauth/youtube/callback"
    );
    expect(getOAuthRedirectUri("instagram")).toBe(
      "https://cadence.theeyelevelstudio.com/api/oauth/instagram/callback"
    );
    expect(getOAuthRedirectUri("twitter")).toBe(
      "https://cadence.theeyelevelstudio.com/api/oauth/twitter/callback"
    );
  });

  describe("getSafeRedirectUrl", () => {
    it("anchors relative path to production base URL", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("BETTER_AUTH_URL", "https://cadence.theeyelevelstudio.com");

      const url = getSafeRedirectUrl("/posts/cmwqahcbb");
      expect(url.toString()).toBe("https://cadence.theeyelevelstudio.com/posts/cmwqahcbb");
    });

    it("strips internal docker container host and retains path and query params", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("BETTER_AUTH_URL", "https://cadence.theeyelevelstudio.com");

      const internalUrl = "http://ad6831befe30:3000/posts/cmwqahcbb?tab=review#preview";
      const url = getSafeRedirectUrl(internalUrl);
      expect(url.toString()).toBe("https://cadence.theeyelevelstudio.com/posts/cmwqahcbb?tab=review");
    });

    it("falls back safely when path is null or undefined", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("BETTER_AUTH_URL", "https://cadence.theeyelevelstudio.com");

      const url = getSafeRedirectUrl(null, "/clients/client_123/settings");
      expect(url.toString()).toBe("https://cadence.theeyelevelstudio.com/clients/client_123/settings");

      const defaultFallback = getSafeRedirectUrl(undefined);
      expect(defaultFallback.toString()).toBe("https://cadence.theeyelevelstudio.com/planner");
    });

    it("preserves additional searchParams appended to the returned URL", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("BETTER_AUTH_URL", "https://cadence.theeyelevelstudio.com");

      const url = getSafeRedirectUrl("/posts/cmwqahcbb");
      url.searchParams.set("connected", "linkedin");
      url.searchParams.set("oauth_success", "1");
      url.searchParams.set("platform", "linkedin");

      expect(url.toString()).toBe(
        "https://cadence.theeyelevelstudio.com/posts/cmwqahcbb?connected=linkedin&oauth_success=1&platform=linkedin"
      );
    });
  });
});
