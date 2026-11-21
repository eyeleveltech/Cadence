import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchPostMetrics } from "./analytics";

describe("Social Platform Analytics (lib/social/analytics.ts)", () => {
  const originalEnv = process.env.SOCIAL_DEV_SIMULATE;

  beforeEach(() => {
    delete process.env.SOCIAL_DEV_SIMULATE;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.SOCIAL_DEV_SIMULATE = originalEnv;
    vi.restoreAllMocks();
  });

  describe("Dev Simulation Mode", () => {
    it("returns deterministic realistic simulated metrics when SOCIAL_DEV_SIMULATE=1", async () => {
      process.env.SOCIAL_DEV_SIMULATE = "1";
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const m1 = await fetchPostMetrics({
        platform: "INSTAGRAM",
        externalPostId: "real_post_123",
        accessToken: "some_token",
      });

      const m2 = await fetchPostMetrics({
        platform: "INSTAGRAM",
        externalPostId: "real_post_123",
        accessToken: "some_token",
      });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(m1).toEqual(m2); // Deterministic
      expect(m1.impressions).toBeGreaterThan(1000);
      expect(m1.reach).toBeGreaterThan(500);
      expect(m1.likes).toBeGreaterThan(30);
      expect(m1.comments).toBeGreaterThan(0);
      expect(m1.engagements).toBe(
        (m1.likes ?? 0) + (m1.comments ?? 0) + (m1.shares ?? 0) + (m1.saves ?? 0),
      );
    });

    it("returns simulated metrics when externalPostId starts with sim_", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const metrics = await fetchPostMetrics({
        platform: "TWITTER",
        externalPostId: "sim_x_998877",
        accessToken: "any_token",
      });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(metrics.impressions).toBeGreaterThan(0);
      expect(metrics.likes).toBeGreaterThan(0);
    });
  });

  describe("Meta Graph API (Instagram & Facebook)", () => {
    it("parses Instagram media fields and insights", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        const urlStr = String(url);
        if (urlStr.includes("/insights")) {
          return new Response(
            JSON.stringify({
              data: [
                { name: "impressions", values: [{ value: 4500 }] },
                { name: "reach", values: [{ value: 3800 }] },
                { name: "saved", values: [{ value: 120 }] },
                { name: "shares", values: [{ value: 35 }] },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (urlStr.includes("like_count")) {
          return new Response(
            JSON.stringify({
              like_count: 245,
              comments_count: 18,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("Not found", { status: 404 });
      });

      const metrics = await fetchPostMetrics({
        platform: "INSTAGRAM",
        externalPostId: "17890123456789",
        accessToken: "EAAX_meta_token_abc",
      });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(metrics.impressions).toBe(4500);
      expect(metrics.reach).toBe(3800);
      expect(metrics.likes).toBe(245);
      expect(metrics.comments).toBe(18);
      expect(metrics.saves).toBe(120);
      expect(metrics.shares).toBe(35);
      expect(metrics.engagements).toBe(245 + 18 + 35 + 120);
    });

    it("parses Facebook page post metrics", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        const urlStr = String(url);
        if (urlStr.includes("/insights")) {
          return new Response(
            JSON.stringify({
              data: [
                { name: "post_impressions", values: [{ value: 1800 }] },
                { name: "post_engaged_users", values: [{ value: 1400 }] },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (urlStr.includes("like_count")) {
          return new Response(
            JSON.stringify({
              like_count: 95,
              comments_count: 12,
              shares: { count: 8 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("Not found", { status: 404 });
      });

      const metrics = await fetchPostMetrics({
        platform: "FACEBOOK",
        externalPostId: "page_post_778899",
        accessToken: "EAAY_fb_token_xyz",
      });

      expect(metrics.impressions).toBe(1800);
      expect(metrics.reach).toBe(1400);
      expect(metrics.likes).toBe(95);
      expect(metrics.comments).toBe(12);
      expect(metrics.shares).toBe(8);
      expect(metrics.engagements).toBe(95 + 12 + 8);
    });
  });

  describe("LinkedIn Statistics & Social Actions", () => {
    it("parses LinkedIn social actions and share statistics", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        const urlStr = String(url);
        if (urlStr.includes("/socialActions/")) {
          return new Response(
            JSON.stringify({
              likesSummary: { totalLikes: 82 },
              commentsSummary: { totalComments: 14 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (urlStr.includes("organizationalEntityShareStatistics")) {
          return new Response(
            JSON.stringify({
              elements: [
                {
                  totalShareStatistics: {
                    impressionCount: 2200,
                    clickCount: 65,
                    shareCount: 19,
                  },
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("Not found", { status: 404 });
      });

      const metrics = await fetchPostMetrics({
        platform: "LINKEDIN",
        externalPostId: "urn:li:share:987654321",
        accessToken: "AQW_linkedin_token",
      });

      expect(metrics.likes).toBe(82);
      expect(metrics.comments).toBe(14);
      expect(metrics.impressions).toBe(2200);
      expect(metrics.clicks).toBe(65);
      expect(metrics.shares).toBe(19);
      expect(metrics.engagements).toBe(82 + 14 + 19 + 65);
    });
  });

  describe("YouTube Data API v3", () => {
    it("parses video viewCount, likeCount, commentCount", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).includes("googleapis.com/youtube/v3/videos")) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  statistics: {
                    viewCount: "35400",
                    likeCount: "1250",
                    commentCount: "140",
                  },
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("Not found", { status: 404 });
      });

      const metrics = await fetchPostMetrics({
        platform: "YOUTUBE",
        externalPostId: "dQw4w9WgXcQ",
        accessToken: "ya29_google_token",
      });

      expect(metrics.impressions).toBe(35400);
      expect(metrics.reach).toBe(35400);
      expect(metrics.likes).toBe(1250);
      expect(metrics.comments).toBe(140);
      expect(metrics.engagements).toBe(1390);
    });
  });

  describe("Twitter API v2", () => {
    it("parses tweet public_metrics", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).includes("api.twitter.com/2/tweets/")) {
          return new Response(
            JSON.stringify({
              data: {
                id: "tweet_556677",
                public_metrics: {
                  retweet_count: 22,
                  reply_count: 9,
                  like_count: 154,
                  quote_count: 4,
                  bookmark_count: 31,
                  impression_count: 5200,
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("Not found", { status: 404 });
      });

      const metrics = await fetchPostMetrics({
        platform: "TWITTER",
        externalPostId: "tweet_556677",
        accessToken: "twitter_bearer_token",
      });

      expect(metrics.impressions).toBe(5200);
      expect(metrics.reach).toBe(5200);
      expect(metrics.likes).toBe(154);
      expect(metrics.comments).toBe(9);
      expect(metrics.shares).toBe(22 + 4);
      expect(metrics.saves).toBe(31);
      expect(metrics.engagements).toBe(154 + 9 + 26 + 31);
    });
  });
});

