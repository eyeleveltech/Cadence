// Shared with the standalone worker process — no "server-only" guard.
import type { Platform, SocialAccount } from "@prisma/client";
import { decryptToken } from "../crypto";

export type PublishInput = {
  caption: string;
  hashtags: string[];
  mediaUrls: string[];
  postAsStory: boolean;
  account: SocialAccount;
};

export type PublishResult = { externalId: string };

/**
 * One shape every platform publishes through. Nothing outside this file
 * (the worker included) should know how any individual platform's API
 * works — swapping a stub for the real Meta/LinkedIn/YouTube call is a
 * change contained entirely to that platform's adapter.
 */
export interface SocialAdapter {
  publish(input: PublishInput): Promise<PublishResult>;
}

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? "v26.0";

function isSimulateMode(): boolean {
  return process.env.SOCIAL_DEV_SIMULATE === "1";
}

function isSimulatedAccount(account: SocialAccount, token: string): boolean {
  return (
    isSimulateMode() ||
    token.startsWith("sim") ||
    token === "mock" ||
    account.externalAccountId.startsWith("sandbox_") ||
    account.externalAccountId.startsWith("sim_") ||
    account.accountName.toLowerCase().includes("sandbox")
  );
}

function resolveAccessToken(account: SocialAccount): string {
  try {
    return decryptToken(account.accessToken);
  } catch {
    return account.accessToken;
  }
}

function formatMessage(caption: string, hashtags: string[]): string {
  const tags = hashtags
    .filter(Boolean)
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .join(" ");
  return [caption.trim(), tags].filter(Boolean).join("\n\n");
}

const facebookAdapter: SocialAdapter = {
  async publish(input) {
    const accessToken = resolveAccessToken(input.account);
    const message = formatMessage(input.caption, input.hashtags);

    if (isSimulatedAccount(input.account, accessToken)) {
      console.log(`[SIMULATION: Facebook Page ${input.account.accountName}] Publishing:`, {
        pageId: input.account.externalAccountId,
        message,
        mediaUrls: input.mediaUrls,
      });
      await new Promise((r) => setTimeout(r, 800));
      return { externalId: `sim_fb_${Date.now()}` };
    }

    if (input.mediaUrls.length > 0) {
      const photoUrl = input.mediaUrls[0];
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${input.account.externalAccountId}/photos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: photoUrl,
            caption: message,
            access_token: accessToken,
          }),
        },
      );
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Facebook photo publish failed: ${errText}`);
      }
      const data = (await res.json()) as { id?: string; post_id?: string };
      return { externalId: data.id || data.post_id || `fb_${Date.now()}` };
    } else {
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${input.account.externalAccountId}/feed`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            access_token: accessToken,
          }),
        },
      );
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Facebook post publish failed: ${errText}`);
      }
      const data = (await res.json()) as { id?: string };
      return { externalId: data.id || `fb_${Date.now()}` };
    }
  },
};

const instagramAdapter: SocialAdapter = {
  async publish(input) {
    const accessToken = resolveAccessToken(input.account);
    const message = formatMessage(input.caption, input.hashtags);

    if (isSimulatedAccount(input.account, accessToken)) {
      console.log(`[SIMULATION: Instagram @${input.account.accountName}] Publishing:`, {
        igUserId: input.account.externalAccountId,
        caption: message,
        mediaUrls: input.mediaUrls,
        postAsStory: input.postAsStory,
      });
      await new Promise((r) => setTimeout(r, 1000));
      return { externalId: `sim_ig_${Date.now()}` };
    }

    if (input.mediaUrls.length === 0) {
      throw new Error("Instagram requires at least one image or video to publish.");
    }

    const mediaUrl = input.mediaUrls[0];

    // Step 1: Create Container
    const containerParams: Record<string, string> = {
      access_token: accessToken,
    };

    if (input.postAsStory) {
      containerParams.media_type = "STORIES";
      containerParams.image_url = mediaUrl;
    } else {
      containerParams.image_url = mediaUrl;
      if (message) containerParams.caption = message;
    }

    const containerRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${input.account.externalAccountId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(containerParams),
      },
    );

    if (!containerRes.ok) {
      const errText = await containerRes.text();
      throw new Error(`Instagram container creation failed: ${errText}`);
    }

    const containerData = (await containerRes.json()) as { id?: string };
    if (!containerData.id) {
      throw new Error("Instagram did not return a container creation ID.");
    }

    // Step 2: Publish Container
    const publishRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${input.account.externalAccountId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: containerData.id,
          access_token: accessToken,
        }),
      },
    );

    if (!publishRes.ok) {
      const errText = await publishRes.text();
      throw new Error(`Instagram media publish failed: ${errText}`);
    }

    const publishData = (await publishRes.json()) as { id?: string };
    return { externalId: publishData.id || `ig_${Date.now()}` };
  },
};

const linkedinAdapter: SocialAdapter = {
  async publish(input) {
    const accessToken = resolveAccessToken(input.account);
    const message = formatMessage(input.caption, input.hashtags);

    if (isSimulatedAccount(input.account, accessToken)) {
      console.log(`[SIMULATION: LinkedIn ${input.account.accountName}] Publishing:`, {
        orgId: input.account.externalAccountId,
        message,
        mediaUrls: input.mediaUrls,
      });
      await new Promise((r) => setTimeout(r, 900));
      return { externalId: `sim_li_${Date.now()}` };
    }

    const author = `urn:li:organization:${input.account.externalAccountId}`;
    const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: message },
            shareMediaCategory: "NONE",
          },
        },
        visibility: {
          "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`LinkedIn publish failed: ${errText}`);
    }

    const data = (await res.json()) as { id?: string };
    return { externalId: data.id || `li_${Date.now()}` };
  },
};

const youtubeAdapter: SocialAdapter = {
  async publish(input) {
    const accessToken = resolveAccessToken(input.account);
    const message = formatMessage(input.caption, input.hashtags);
    const title = input.caption.split("\n")[0].slice(0, 95) || "Cadence Post";

    if (isSimulatedAccount(input.account, accessToken)) {
      console.log(`[SIMULATION: YouTube ${input.account.accountName}] Publishing:`, {
        channelId: input.account.externalAccountId,
        title,
        message,
        mediaUrls: input.mediaUrls,
      });
      await new Promise((r) => setTimeout(r, 1200));
      return { externalId: `sim_yt_${Date.now()}` };
    }

    if (!input.mediaUrls || input.mediaUrls.length === 0) {
      throw new Error("YouTube requires a video media URL to publish.");
    }

    const videoUrl = input.mediaUrls[0];
    const mediaRes = await fetch(videoUrl);
    if (!mediaRes.ok) {
      throw new Error(`Failed to download media for YouTube upload: ${mediaRes.statusText}`);
    }
    const videoBuffer = await mediaRes.arrayBuffer();
    const contentType = mediaRes.headers.get("content-type") || "video/mp4";

    const metadata = {
      snippet: {
        title,
        description: message,
        tags: input.hashtags,
        categoryId: "22",
      },
      status: {
        privacyStatus: "public",
        selfDeclaredMadeForKids: false,
      },
    };

    const boundary = `cadence_boundary_${Date.now()}`;
    const delimiter = `--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metaPart =
      `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) +
      `\r\n${delimiter}Content-Type: ${contentType}\r\n\r\n`;

    const metaBuffer = Buffer.from(metaPart, "utf-8");
    const closeBuffer = Buffer.from(closeDelimiter, "utf-8");
    const payload = Buffer.concat([metaBuffer, Buffer.from(videoBuffer), closeBuffer]);

    const res = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
          "Content-Length": String(payload.length),
        },
        body: payload,
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`YouTube publish failed: ${errText}`);
    }

    const data = (await res.json()) as { id?: string };
    return { externalId: data.id || `yt_${Date.now()}` };
  },
};

const twitterAdapter: SocialAdapter = {
  async publish(input) {
    const accessToken = resolveAccessToken(input.account);
    const message = formatMessage(input.caption, input.hashtags);

    if (isSimulatedAccount(input.account, accessToken)) {
      console.log(`[SIMULATION: X / Twitter @${input.account.accountName}] Publishing tweet:`, {
        message,
        mediaUrls: input.mediaUrls,
      });
      await new Promise((r) => setTimeout(r, 600));
      return { externalId: `sim_x_${Date.now()}` };
    }

    const res = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: message }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`X (Twitter) publish failed: ${err}`);
    }

    const data = (await res.json()) as { data?: { id?: string } };
    return { externalId: data.data?.id || `x_${Date.now()}` };
  },
};

const ADAPTERS: Record<Platform, SocialAdapter> = {
  INSTAGRAM: instagramAdapter,
  FACEBOOK: facebookAdapter,
  LINKEDIN: linkedinAdapter,
  YOUTUBE: youtubeAdapter,
  TWITTER: twitterAdapter,
};

export function getSocialAdapter(platform: Platform): SocialAdapter {
  return ADAPTERS[platform];
}

