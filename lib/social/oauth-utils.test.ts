import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getOAuthRedirectUri, getBaseUrl } from "./oauth-utils";

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
});
