import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getSocialAdapter } from "./adapter";
import { storage } from "../storage";
import type { Platform, SocialAccount } from "@prisma/client";

function createMockAccount(platform: Platform, simulated = false): SocialAccount {
  return {
    id: `acc-${platform.toLowerCase()}`,
    clientId: "client-123",
    platform,
    accountName: "Cadence Growth",
    avatarUrl: null,
    externalAccountId: simulated ? "sim_org_1" : "123456",
    accessToken: "plain-mock-token-xyz",
    refreshToken: null,
    tokenType: "USER",
    tokenExpiresAt: new Date(Date.now() + 86400000),
    connectionStatus: "CONNECTED",
    statusDetail: null,
    lastHealthCheckAt: new Date(),
    scopes: [],
    connectedById: "user-123",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("Social Adapters - Media Publishing (lib/social/adapter.ts)", () => {
  const originalEnv = process.env.SOCIAL_DEV_SIMULATE;

  beforeEach(() => {
    delete process.env.SOCIAL_DEV_SIMULATE;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.SOCIAL_DEV_SIMULATE = originalEnv;
    vi.restoreAllMocks();
  });

  describe("LinkedIn Adapter", () => {
    const adapter = getSocialAdapter("LINKEDIN");

    it("publishes a text-only post when no media attached", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).includes("/ugcPosts")) {
          return new Response(JSON.stringify({ id: "urn:li:share:112233" }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not found", { status: 404 });
      });

      const account = createMockAccount("LINKEDIN");
      const res = await adapter.publish({
        caption: "Exciting company update!",
        hashtags: ["growth", "b2b"],
        mediaUrls: [],
        postAsStory: false,
        account,
      });

      expect(res.externalId).toBe("urn:li:share:112233");
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [calledUrl, init] = fetchSpy.mock.calls[0];
      expect(String(calledUrl)).toBe("https://api.linkedin.com/v2/ugcPosts");

      const body = JSON.parse(init?.body as string);
      expect(body.author).toBe("urn:li:organization:123456");
      expect(body.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory).toBe("NONE");
      expect(body.specificContent["com.linkedin.ugc.ShareContent"].media).toBeUndefined();
      expect(body.specificContent["com.linkedin.ugc.ShareContent"].shareCommentary.text).toContain(
        "Exciting company update!",
      );
      expect(body.specificContent["com.linkedin.ugc.ShareContent"].shareCommentary.text).toContain(
        "#growth #b2b",
      );
    });

    it("performs 3-step register + binary PUT + UGC post for image attachment", async () => {
      vi.spyOn(storage, "read").mockResolvedValue(Buffer.from("fake-image-bytes"));

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes("action=registerUpload")) {
          return new Response(
            JSON.stringify({
              value: {
                uploadMechanism: {
                  "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
                    uploadUrl: "https://media.licdn.com/upload/target-image-123",
                  },
                },
                asset: "urn:li:digitalmediaAsset:IMAGE_XYZ",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (urlStr.includes("target-image-123")) {
          expect(init?.method).toBe("PUT");
          expect(init?.headers).toMatchObject({ "Content-Type": "image/jpeg" });
          return new Response(null, { status: 201 });
        }
        if (urlStr.includes("/ugcPosts")) {
          return new Response(JSON.stringify({ id: "urn:li:share:img_post_999" }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not found", { status: 404 });
      });

      const account = createMockAccount("LINKEDIN");
      const res = await adapter.publish({
        caption: "Photo announcement",
        hashtags: [],
        mediaUrls: ["/api/media/client-1/asset-1/photo.jpg"],
        postAsStory: false,
        account,
      });

      expect(res.externalId).toBe("urn:li:share:img_post_999");
      expect(fetchSpy).toHaveBeenCalledTimes(3);

      // Verify registerUpload request used feedshare-image recipe
      const regBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(regBody.registerUploadRequest.recipes).toEqual([
        "urn:li:digitalmediaRecipe:feedshare-image",
      ]);

      // Verify ugcPosts request had shareMediaCategory: IMAGE and asset reference
      const ugcBody = JSON.parse(fetchSpy.mock.calls[2][1]?.body as string);
      expect(ugcBody.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory).toBe(
        "IMAGE",
      );
      expect(ugcBody.specificContent["com.linkedin.ugc.ShareContent"].media[0].media).toBe(
        "urn:li:digitalmediaAsset:IMAGE_XYZ",
      );
    });

    it("uses feedshare-video recipe and shareMediaCategory: VIDEO for video attachment", async () => {
      vi.spyOn(storage, "read").mockResolvedValue(Buffer.from("fake-video-bytes"));

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        const urlStr = String(url);
        if (urlStr.includes("action=registerUpload")) {
          return new Response(
            JSON.stringify({
              value: {
                uploadMechanism: {
                  "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
                    uploadUrl: "https://media.licdn.com/upload/target-video-456",
                  },
                },
                asset: "urn:li:digitalmediaAsset:VIDEO_XYZ",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (urlStr.includes("target-video-456")) {
          return new Response(null, { status: 200 });
        }
        if (urlStr.includes("/ugcPosts")) {
          return new Response(JSON.stringify({ id: "urn:li:share:video_post_888" }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not found", { status: 404 });
      });

      const account = createMockAccount("LINKEDIN");
      const res = await adapter.publish({
        caption: "Check out our new reel!",
        hashtags: ["reels"],
        mediaUrls: ["/api/media/client-1/asset-2/video.mp4"],
        postAsStory: false,
        account,
      });

      expect(res.externalId).toBe("urn:li:share:video_post_888");

      // Verify recipe was video
      const regBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(regBody.registerUploadRequest.recipes).toEqual([
        "urn:li:digitalmediaRecipe:feedshare-video",
      ]);

      // Verify ugcPosts was VIDEO category
      const ugcBody = JSON.parse(fetchSpy.mock.calls[2][1]?.body as string);
      expect(ugcBody.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory).toBe(
        "VIDEO",
      );
      expect(ugcBody.specificContent["com.linkedin.ugc.ShareContent"].media[0].media).toBe(
        "urn:li:digitalmediaAsset:VIDEO_XYZ",
      );
    });

    it("short-circuits with sim_li_ ID in SOCIAL_DEV_SIMULATE mode", async () => {
      process.env.SOCIAL_DEV_SIMULATE = "1";
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const account = createMockAccount("LINKEDIN");
      const res = await adapter.publish({
        caption: "Simulated LinkedIn",
        hashtags: [],
        mediaUrls: ["/api/media/client-1/asset-1/photo.jpg"],
        postAsStory: false,
        account,
      });

      expect(res.externalId).toMatch(/^sim_li_\d+$/);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("posts first comment when firstComment option is provided", async () => {
      const commentCalls: Array<{ url: string; init?: RequestInit }> = [];
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes("/ugcPosts")) {
          return new Response(JSON.stringify({ id: "urn:li:share:with_first_comment_123" }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (urlStr.includes("/socialActions/")) {
          commentCalls.push({ url: urlStr, init });
          return new Response(JSON.stringify({ id: "comment_urn_456" }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not found", { status: 404 });
      });

      const account = createMockAccount("LINKEDIN");
      const res = await adapter.publish({
        caption: "Main LinkedIn Post",
        hashtags: [],
        mediaUrls: [],
        postAsStory: false,
        account,
        firstComment: "Link in comments: https://example.com/blog",
      });

      expect(res.externalId).toBe("urn:li:share:with_first_comment_123");
      expect(commentCalls.length).toBe(1);
      expect(commentCalls[0].url).toContain(encodeURIComponent("urn:li:share:with_first_comment_123"));
      const commentBody = JSON.parse(commentCalls[0].init?.body as string);
      expect(commentBody.message.text).toBe("Link in comments: https://example.com/blog");
    });
  });

  describe("Instagram Adapter", () => {
    const adapter = getSocialAdapter("INSTAGRAM");

    it("publishes an image post and posts the first comment to the container", async () => {
      vi.spyOn(storage, "read").mockResolvedValue(Buffer.from("fake-image-bytes"));
      const commentCalls: Array<{ url: string; init?: RequestInit }> = [];
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes("/media") && !urlStr.includes("media_publish") && !urlStr.includes("/comments")) {
          return new Response(JSON.stringify({ id: "ig_container_123" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (urlStr.includes("ig_container_123?fields=status_code")) {
          return new Response(JSON.stringify({ status_code: "FINISHED" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (urlStr.includes("/media_publish")) {
          return new Response(JSON.stringify({ id: "ig_published_999" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (urlStr.includes("ig_published_999?fields=permalink")) {
          return new Response(JSON.stringify({ permalink: "https://www.instagram.com/p/live_post_999/" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (urlStr.includes("/comments")) {
          commentCalls.push({ url: urlStr, init });
          return new Response(JSON.stringify({ id: "ig_comment_555" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not found", { status: 404 });
      });

      const account = createMockAccount("INSTAGRAM");
      const res = await adapter.publish({
        caption: "Main photo caption",
        hashtags: ["agency"],
        mediaUrls: ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
        postAsStory: false,
        account,
        firstComment: "#marketing #growth #social #firstcomment",
      });

      expect(res.externalId).toBe("ig_published_999");
      expect(commentCalls.length).toBe(1);
      expect(commentCalls[0].url).toContain("/ig_published_999/comments");
      const commentBody = JSON.parse(commentCalls[0].init?.body as string);
      expect(commentBody.message).toBe("#marketing #growth #social #firstcomment");
    });
  });

  describe("X / Twitter Adapter", () => {
    const adapter = getSocialAdapter("TWITTER");

    it("publishes a text-only tweet when no media is attached", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).includes("/2/tweets")) {
          return new Response(JSON.stringify({ data: { id: "tweet_1234567890" } }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not found", { status: 404 });
      });

      const account = createMockAccount("TWITTER");
      const res = await adapter.publish({
        caption: "Just setting up my Cadence tweet",
        hashtags: ["agency"],
        mediaUrls: [],
        postAsStory: false,
        account,
      });

      expect(res.externalId).toBe("tweet_1234567890");
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [calledUrl, init] = fetchSpy.mock.calls[0];
      expect(String(calledUrl)).toBe("https://api.twitter.com/2/tweets");

      const body = JSON.parse(init?.body as string);
      expect(body.text).toContain("Just setting up my Cadence tweet");
      expect(body.text).toContain("#agency");
      expect(body.media).toBeUndefined();
    });

    it("uploads media via INIT/APPEND/FINALIZE and attaches media_ids to tweet", async () => {
      vi.spyOn(storage, "read").mockResolvedValue(Buffer.from("mock-tweet-image-data"));

      const uploadCalls: string[] = [];
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes("upload.twitter.com")) {
          // Check commands
          const body = init?.body;
          if (typeof body === "string") {
            const params = new URLSearchParams(body);
            const cmd = params.get("command");
            uploadCalls.push(cmd || "unknown");
            if (cmd === "INIT") {
              return new Response(
                JSON.stringify({ media_id_string: "twitter_media_id_777" }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              );
            }
            if (cmd === "FINALIZE") {
              return new Response(
                JSON.stringify({ media_id_string: "twitter_media_id_777" }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              );
            }
          } else if (body instanceof FormData) {
            const cmd = body.get("command");
            uploadCalls.push(String(cmd));
            return new Response(null, { status: 204 });
          }
        }
        if (urlStr.includes("/2/tweets")) {
          return new Response(JSON.stringify({ data: { id: "tweet_media_success" } }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not found", { status: 404 });
      });

      const account = createMockAccount("TWITTER");
      const res = await adapter.publish({
        caption: "Look at this picture",
        hashtags: [],
        mediaUrls: ["/api/media/client-1/asset-1/photo.jpg"],
        postAsStory: false,
        account,
      });

      expect(res.externalId).toBe("tweet_media_success");
      expect(uploadCalls).toEqual(["INIT", "APPEND", "FINALIZE"]);

      // Verify the final /2/tweets call had media.media_ids
      const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
      expect(String(lastCall[0])).toBe("https://api.twitter.com/2/tweets");
      const tweetBody = JSON.parse(lastCall[1]?.body as string);
      expect(tweetBody.media).toEqual({ media_ids: ["twitter_media_id_777"] });
    });

    it("short-circuits with sim_x_ ID in SOCIAL_DEV_SIMULATE mode", async () => {
      process.env.SOCIAL_DEV_SIMULATE = "1";
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const account = createMockAccount("TWITTER");
      const res = await adapter.publish({
        caption: "Simulated Twitter Tweet",
        hashtags: [],
        mediaUrls: ["/api/media/client-1/asset-1/photo.jpg"],
        postAsStory: false,
        account,
      });

      expect(res.externalId).toMatch(/^sim_x_\d+$/);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("YouTube Adapter", () => {
    const adapter = getSocialAdapter("YOUTUBE");

    it("throws when no media is provided", async () => {
      const account = createMockAccount("YOUTUBE");
      await expect(
        adapter.publish({
          caption: "YouTube video title",
          hashtags: ["agency"],
          mediaUrls: [],
          postAsStory: false,
          account,
        }),
      ).rejects.toThrow(
        "YouTube only supports video uploads (MP4, MOV). Please remove YouTube from this post or attach a video asset.",
      );
    });

    it("throws when an image is provided instead of a video", async () => {
      vi.spyOn(storage, "read").mockResolvedValue(Buffer.from("fake-jpeg-image"));

      const account = createMockAccount("YOUTUBE");
      await expect(
        adapter.publish({
          caption: "YouTube video title",
          hashtags: ["agency"],
          mediaUrls: ["/api/media/client-1/asset-1/photo.jpg"],
          postAsStory: false,
          account,
        }),
      ).rejects.toThrow(
        "YouTube only supports video uploads (MP4, MOV). Please remove YouTube from this post or attach a video asset.",
      );
    });

    it("publishes successfully when a video is provided", async () => {
      vi.spyOn(storage, "read").mockResolvedValue(Buffer.from("fake-video-bytes"));

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).includes("googleapis.com/upload/youtube/v3/videos")) {
          return new Response(JSON.stringify({ id: "yt_video_12345" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not found", { status: 404 });
      });

      const account = createMockAccount("YOUTUBE");
      const res = await adapter.publish({
        caption: "YouTube video title\nDetailed description here",
        hashtags: ["agency", "video"],
        mediaUrls: ["/api/media/client-1/asset-1/clip.mp4"],
        postAsStory: false,
        account,
      });

      expect(res.externalId).toBe("yt_video_12345");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("preparePublicMediaUrl", () => {
    it("bypasses re-upload when URL is already external HTTPS", async () => {
      const { preparePublicMediaUrl } = await import("./adapter");
      const externalUrl = "https://res.cloudinary.com/demo/image/upload/sample.jpg";
      const result = await preparePublicMediaUrl(externalUrl);
      expect(result).toBe(externalUrl);
    });
  });
});
