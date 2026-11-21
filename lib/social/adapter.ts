// Shared with the standalone worker process — no "server-only" guard.
import sharp from "sharp";
import { v2 as cloudinary } from "cloudinary";
import type { Platform, SocialAccount } from "@prisma/client";
import { decryptToken } from "../crypto";
import { storage, isCloudinaryConfigured, configureCloudinary } from "../storage";
import { prisma } from "../prisma";
import { getValidAccessToken } from "./tokens";
import { prepareInstagramCollaborators } from "./instagram";
import { classifyYouTubeVideo } from "./youtube";

export type PublishInput = {
  caption: string;
  hashtags: string[];
  mediaUrls: string[];
  postAsStory: boolean;
  account: SocialAccount;
  collaborators?: string[];
  title?: string;
  firstComment?: string | null;
  mediaAsset?: {
    width?: number | null;
    height?: number | null;
    durationSecs?: number | null;
    originalUrl?: string;
  };
};

export type PublishResult = {
  externalId: string;
  permalink?: string;
};

/**
 * One shape every platform publishes through. Nothing outside this file
 * (the worker included) should know how any individual platform's API
 * works — swapping a stub for the real Meta/LinkedIn/YouTube call is a
 * change contained entirely to that platform's adapter.
 */
export interface SocialAdapter {
  publish(input: PublishInput): Promise<PublishResult>;
}

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? "v22.0";

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

async function resolveAccessToken(account: SocialAccount): Promise<string> {
  try {
    return await getValidAccessToken(account);
  } catch {
    try {
      return decryptToken(account.accessToken);
    } catch {
      return account.accessToken;
    }
  }
}

function formatMessage(caption: string, hashtags: string[]): string {
  const tags = hashtags
    .filter(Boolean)
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .join(" ");
  return [caption.trim(), tags].filter(Boolean).join("\n\n");
}

export interface MediaPayload {
  buffer: Buffer;
  contentType: string;
  isImage: boolean;
  isVideo: boolean;
}

export async function readMediaPayload(mediaUrl: string): Promise<MediaPayload> {
  let buffer: Buffer | null = null;
  let contentType = "application/octet-stream";

  let target = mediaUrl;
  if ((target.startsWith("http://localhost") || target.startsWith("http://127.0.0.1")) && target.includes("/api/media/")) {
    try {
      const parsed = new URL(target);
      target = parsed.pathname;
    } catch {}
  }

  if (target.startsWith("http://") || target.startsWith("https://")) {
    try {
      const res = await fetch(target);
      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
        const headerType = res.headers.get("content-type");
        if (headerType) contentType = headerType;
      }
    } catch (err) {
      console.warn(`[readMediaPayload] Remote fetch failed for ${target}, trying storage:`, err);
    }
  }

  // Fallback to storage.read (which checks local disk and Cloudinary)
  if (!buffer) {
    buffer = await storage.read(target);
  }

  if (!buffer) {
    throw new Error(`Failed to read media from storage: ${mediaUrl}`);
  }

  const cleanUrl = mediaUrl.split("?")[0].toLowerCase();
  if (contentType === "application/octet-stream") {
    if (cleanUrl.endsWith(".jpg") || cleanUrl.endsWith(".jpeg")) contentType = "image/jpeg";
    else if (cleanUrl.endsWith(".png")) contentType = "image/png";
    else if (cleanUrl.endsWith(".webp")) contentType = "image/webp";
    else if (cleanUrl.endsWith(".mp4")) contentType = "video/mp4";
    else if (cleanUrl.endsWith(".mov")) contentType = "video/quicktime";
    else if (cleanUrl.endsWith(".webm")) contentType = "video/webm";
  }

  const isVideo =
    contentType.startsWith("video/") ||
    cleanUrl.endsWith(".mp4") ||
    cleanUrl.endsWith(".mov") ||
    cleanUrl.endsWith(".webm");
  const isImage = !isVideo;

  return { buffer, contentType, isImage, isVideo };
}

/**
 * Ensures media files have a publicly reachable HTTPS URL as required by Meta/Instagram.
 * If running locally with Cloudinary configured, uploads/converts local assets to Cloudinary.
 */
export async function preparePublicMediaUrl(mediaUrl: string, options?: { isVideo?: boolean }): Promise<string> {
  // 1. If already public HTTPS (e.g. Cloudinary, S3, or public CDN), use directly
  if (
    mediaUrl.startsWith("https://") &&
    !mediaUrl.includes("localhost") &&
    !mediaUrl.includes("127.0.0.1")
  ) {
    return mediaUrl;
  }

  // 2. Read local media buffer
  const payload = await readMediaPayload(mediaUrl);
  let uploadBuffer = payload.buffer;

  // Convert PNG/WebP images to sRGB JPEG for Instagram API strict compliance
  if (payload.isImage && !options?.isVideo) {
    try {
      uploadBuffer = await sharp(payload.buffer)
        .jpeg({ quality: 90 })
        .toBuffer();
    } catch {
      // use raw buffer if conversion fails
    }
  }

  // 3. Cloudinary bridge
  if (isCloudinaryConfigured()) {
    try {
      configureCloudinary();
      const isVideo = payload.isVideo || Boolean(options?.isVideo);
      const publicId = `cadence_pub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const uploadedUrl = await new Promise<string>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            public_id: publicId,
            resource_type: "auto",
            format: isVideo ? undefined : "jpg",
            overwrite: true,
          },
          (error, result) => {
            if (error || !result) {
              const errDetails = error as { message?: string; http_code?: number; name?: string } | undefined;
              console.error("[Cloudinary Upload Error Details]:", {
                message: errDetails?.message,
                http_code: errDetails?.http_code,
                name: errDetails?.name,
                cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
              });
              const msg =
                error?.message ||
                (typeof error === "string" ? error : JSON.stringify(error)) ||
                "Cloudinary upload failed";
              reject(new Error(msg));
            } else {
              resolve(result.secure_url);
            }
          }
        );
        uploadStream.end(uploadBuffer);
      });

      console.log(`[adapter:preparePublicMediaUrl] Successfully bridged local media to Cloudinary: ${uploadedUrl}`);

      // Update database record if this was a known media asset so future publishes use the Cloudinary URL directly
      try {
        const segments = mediaUrl.replace(/^\/api\/media\//, "").split("/");
        if (segments.length >= 2) {
          const assetId = segments[1];
          await prisma.mediaAsset.update({
            where: { id: assetId },
            data: { originalUrl: uploadedUrl },
          }).catch(() => {});
        }
      } catch {}

      return uploadedUrl;
    } catch (err: unknown) {
      const errDetails = err as { message?: string; http_code?: number; name?: string } | undefined;
      console.error("[Cloudinary Upload Error Details]:", {
        message: errDetails?.message,
        http_code: errDetails?.http_code,
        name: errDetails?.name,
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      });
      console.error("[adapter:preparePublicMediaUrl] Cloudinary upload bridge failed:", err);
    }
  }

  // 4. Reverse proxy / public tunnel URL fallback
  const publicBase = process.env.PUBLIC_APP_URL || (process.env.BETTER_AUTH_URL?.startsWith("https://") ? process.env.BETTER_AUTH_URL : null);
  if (publicBase && !publicBase.includes("localhost") && !publicBase.includes("127.0.0.1")) {
    const cleanPrefix = publicBase.replace(/\/$/, "");
    if (mediaUrl.startsWith("/")) return `${cleanPrefix}${mediaUrl}`;
    return `${cleanPrefix}/${mediaUrl}`;
  }

  // 5. Local development fallback
  if (isSimulateMode() || mediaUrl.startsWith("sim_")) {
    return mediaUrl;
  }

  throw new Error(
    "Instagram / Facebook Graph API requires a publicly reachable HTTPS media URL to publish. " +
    "Cloudinary upload failed and no PUBLIC_APP_URL is configured. " +
    "Please verify your Cloudinary credentials in .env or set PUBLIC_APP_URL to a public HTTPS tunnel."
  );
}

async function pollInstagramContainer(
  igUserId: string,
  containerId: string,
  accessToken: string,
  maxWaitSecs = 30,
): Promise<void> {
  const start = Date.now();
  while ((Date.now() - start) < maxWaitSecs * 1000) {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${containerId}?fields=status_code,status&access_token=${accessToken}`,
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to check Instagram container status: ${err}`);
    }
    const data = (await res.json()) as { status_code?: string; status?: string };
    if (data.status_code === "FINISHED") {
      return;
    }
    if (data.status_code === "ERROR") {
      throw new Error(`Instagram media container processing failed: ${data.status ?? "Unknown error"}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

const facebookAdapter: SocialAdapter = {
  async publish(input) {
    const accessToken = await resolveAccessToken(input.account);
    const message = formatMessage(input.caption, input.hashtags);

    if (isSimulatedAccount(input.account, accessToken)) {
      console.log(`[SIMULATION: Facebook Page ${input.account.accountName}] Publishing:`, {
        pageId: input.account.externalAccountId,
        message,
        mediaUrls: input.mediaUrls,
      });
      await new Promise((r) => setTimeout(r, 800));
      return {
        externalId: `sim_fb_${Date.now()}`,
        permalink: `https://www.facebook.com/sim_fb_${Date.now()}`,
      };
    }

    if (input.mediaUrls.length > 0) {
      const photoUrl = await preparePublicMediaUrl(input.mediaUrls[0]);
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${input.account.externalAccountId}/photos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: photoUrl,
            caption: message,
            access_token: accessToken,
            published: true,
          }),
        },
      );
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Facebook photo publish failed: ${errText}`);
      }
      const data = (await res.json()) as { id?: string; post_id?: string };
      const externalId = data.post_id || data.id || `fb_${Date.now()}`;
      return {
        externalId,
        permalink: `https://www.facebook.com/${externalId}`,
      };
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
      const externalId = data.id || `fb_${Date.now()}`;
      return {
        externalId,
        permalink: `https://www.facebook.com/${externalId}`,
      };
    }
  },
};

const instagramAdapter: SocialAdapter = {
  async publish(input) {
    const accessToken = await resolveAccessToken(input.account);
    const initialMessage = formatMessage(input.caption, input.hashtags);
    const { collaboratorUserIds, finalCaption } = await prepareInstagramCollaborators(
      input.collaborators,
      input.account.externalAccountId,
      accessToken,
      initialMessage
    );
    const message = finalCaption;

    // Sanitize collaborator handles (strip '@' and whitespace)
    const cleanHandles = (input.collaborators || [])
      .map((c) => c.replace(/^@+/, "").trim())
      .filter(Boolean);

    if (isSimulatedAccount(input.account, accessToken)) {
      console.log(`[SIMULATION: Instagram @${input.account.accountName}] Publishing:`, {
        igUserId: input.account.externalAccountId,
        caption: message,
        mediaUrls: input.mediaUrls,
        postAsStory: input.postAsStory,
        collaborators: collaboratorUserIds,
        userTags: cleanHandles,
        firstComment: input.firstComment,
      });
      if (input.firstComment?.trim() && !input.postAsStory) {
        console.log(`[SIMULATION: Instagram @${input.account.accountName}] First comment published: "${input.firstComment.trim()}"`);
      }
      await new Promise((r) => setTimeout(r, 1000));
      return {
        externalId: `sim_ig_${Date.now()}`,
        permalink: `https://www.instagram.com/p/sim_${Date.now()}/`,
      };
    }

    if (input.mediaUrls.length === 0) {
      throw new Error("Instagram requires at least one image or video to publish.");
    }

    let containerId: string;

    // Multi-image Carousel support
    if (input.mediaUrls.length > 1 && !input.postAsStory) {
      const childContainerIds: string[] = [];

      for (const rawUrl of input.mediaUrls) {
        const publicUrl = await preparePublicMediaUrl(rawUrl);
        const payload = await readMediaPayload(rawUrl);
        const childParams: Record<string, string> = {
          access_token: accessToken,
          is_carousel_item: "true",
        };
        if (payload.isVideo) {
          childParams.video_url = publicUrl;
          childParams.media_type = "VIDEO";
        } else {
          childParams.image_url = publicUrl;
          // Apply user_tags on the first image item in carousel
          if (childContainerIds.length === 0 && cleanHandles.length > 0) {
            const userTags = cleanHandles.map((username, index) => ({
              username,
              x: Math.min(0.5 + index * 0.1, 0.9),
              y: 0.5,
            }));
            childParams.user_tags = JSON.stringify(userTags);
          }
        }

        const childRes = await fetch(
          `https://graph.facebook.com/${GRAPH_VERSION}/${input.account.externalAccountId}/media`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(childParams),
          },
        );
        if (!childRes.ok) {
          throw new Error(`Instagram carousel item container creation failed: ${await childRes.text()}`);
        }
        const childData = (await childRes.json()) as { id?: string };
        if (!childData.id) throw new Error("Instagram did not return a carousel child container ID.");

        await pollInstagramContainer(input.account.externalAccountId, childData.id, accessToken);
        childContainerIds.push(childData.id);
      }

      const parentParams: Record<string, string> = {
        access_token: accessToken,
        media_type: "CAROUSEL",
        children: childContainerIds.join(","),
      };
      if (message) parentParams.caption = message;

      const parentRes = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${input.account.externalAccountId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parentParams),
        },
      );
      if (!parentRes.ok) {
        throw new Error(`Instagram carousel parent container creation failed: ${await parentRes.text()}`);
      }
      const parentData = (await parentRes.json()) as { id?: string };
      if (!parentData.id) throw new Error("Instagram did not return carousel parent container ID.");
      containerId = parentData.id;
      await pollInstagramContainer(input.account.externalAccountId, containerId, accessToken);
    } else {
      // Single Media (Image, Reel/Video, or Story)
      const rawUrl = input.mediaUrls[0];
      const publicUrl = await preparePublicMediaUrl(rawUrl);
      const payload = await readMediaPayload(rawUrl);

      const containerParams: Record<string, string> = {
        access_token: accessToken,
      };

      const isReel = payload.isVideo && !input.postAsStory;

      if (input.postAsStory) {
        containerParams.media_type = "STORIES";
        if (payload.isVideo) {
          containerParams.video_url = publicUrl;
        } else {
          containerParams.image_url = publicUrl;
        }
      } else if (isReel) {
        containerParams.media_type = "REELS";
        containerParams.video_url = publicUrl;
        if (message) containerParams.caption = message;

        // Meta only supports 'collaborators' parameter on REELS
        if (collaboratorUserIds.length > 0) {
          containerParams.collaborators = JSON.stringify(collaboratorUserIds);
        } else if (cleanHandles.length > 0) {
          const collabText = `Collab: ${cleanHandles.map((h) => "@" + h).join(" ")}`;
          if (!containerParams.caption?.includes(collabText)) {
            containerParams.caption = (containerParams.caption ? `${containerParams.caption}\n\n` : "") + collabText;
          }
        }
      } else {
        // FEED IMAGE: Meta strictly requires user_tags with coordinates!
        containerParams.image_url = publicUrl;
        if (message) containerParams.caption = message;

        if (cleanHandles.length > 0) {
          const userTags = cleanHandles.map((username, index) => ({
            username,
            x: Math.min(0.5 + index * 0.1, 0.9),
            y: 0.5,
          }));
          containerParams.user_tags = JSON.stringify(userTags);
        }
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
      containerId = containerData.id;
      await pollInstagramContainer(input.account.externalAccountId, containerId, accessToken);
    }

    // Step 2: Publish Container
    const publishRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${input.account.externalAccountId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: accessToken,
        }),
      },
    );

    if (!publishRes.ok) {
      const errText = await publishRes.text();
      throw new Error(`Instagram media publish failed: ${errText}`);
    }

    const publishData = (await publishRes.json()) as { id?: string };
    const publishedMediaId = publishData.id || `ig_${Date.now()}`;

    // Step 3: Fetch live permalink
    let permalink = `https://www.instagram.com/p/${publishedMediaId}/`;
    try {
      const infoRes = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${publishedMediaId}?fields=permalink,id&access_token=${accessToken}`,
      );
      if (infoRes.ok) {
        const infoData = (await infoRes.json()) as { permalink?: string };
        if (infoData.permalink) permalink = infoData.permalink;
      }
    } catch {
      // keep fallback permalink
    }

    // Step 4: First-comment publishing for Instagram
    if (input.firstComment?.trim() && !input.postAsStory) {
      try {
        const commentRes = await fetch(
          `https://graph.facebook.com/${GRAPH_VERSION}/${publishedMediaId}/comments`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: input.firstComment.trim(),
              access_token: accessToken,
            }),
          }
        );
        if (!commentRes.ok) {
          const errText = await commentRes.text();
          console.warn(`[Instagram First Comment Warning] Post ${publishedMediaId} comment failed: ${errText}`);
        } else {
          console.log(`[Instagram First Comment Success] Comment posted to ${publishedMediaId}`);
        }
      } catch (cErr) {
        console.warn(`[Instagram First Comment Exception]`, cErr);
      }
    }

    return {
      externalId: publishedMediaId,
      permalink,
    };
  },
};

const linkedinAdapter: SocialAdapter = {
  async publish(input) {
    const accessToken = await resolveAccessToken(input.account);
    const message = formatMessage(input.caption, input.hashtags);

    if (isSimulatedAccount(input.account, accessToken)) {
      console.log(`[SIMULATION: LinkedIn ${input.account.accountName}] Publishing:`, {
        orgId: input.account.externalAccountId,
        message,
        mediaUrls: input.mediaUrls,
        firstComment: input.firstComment,
      });
      if (input.firstComment?.trim()) {
        console.log(`[SIMULATION: LinkedIn ${input.account.accountName}] First comment published: "${input.firstComment.trim()}"`);
      }
      await new Promise((r) => setTimeout(r, 900));
      return { externalId: `sim_li_${Date.now()}` };
    }

    const author = input.account.externalAccountId.startsWith("urn:li:")
      ? input.account.externalAccountId
      : input.account.tokenType === "PAGE" || (input.account.externalAccountId.length < 15 && /^\d+$/.test(input.account.externalAccountId))
        ? `urn:li:organization:${input.account.externalAccountId}`
        : `urn:li:person:${input.account.externalAccountId}`;
    let shareMediaCategory = "NONE";
    let mediaArray: Array<{
      status: string;
      description: { text: string };
      media: string;
      title: { text: string };
    }> | undefined;

    if (input.mediaUrls && input.mediaUrls.length > 0) {
      const media = await readMediaPayload(input.mediaUrls[0]);
      const recipe = media.isVideo
        ? "urn:li:digitalmediaRecipe:feedshare-video"
        : "urn:li:digitalmediaRecipe:feedshare-image";

      // Step 1: Register upload with LinkedIn
      const registerRes = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          registerUploadRequest: {
            recipes: [recipe],
            owner: author,
            serviceRelationships: [
              {
                relationshipType: "OWNER",
                identifier: "urn:li:userGeneratedContent",
              },
            ],
          },
        }),
      });

      if (!registerRes.ok) {
        const errText = await registerRes.text();
        throw new Error(`LinkedIn registerUpload failed: ${errText}`);
      }

      const registerData = (await registerRes.json()) as {
        value?: {
          uploadMechanism?: {
            "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"?: {
              uploadUrl?: string;
            };
          };
          asset?: string;
        };
      };

      const uploadUrl =
        registerData.value?.uploadMechanism?.[
          "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
        ]?.uploadUrl;
      const assetUrn = registerData.value?.asset;

      if (!uploadUrl || !assetUrn) {
        throw new Error("LinkedIn registerUpload returned incomplete uploadMechanism or asset URN.");
      }

      // Step 2: PUT media binary to uploadUrl
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": media.contentType,
        },
        body: new Uint8Array(media.buffer),
      });

      if (!uploadRes.ok) {
        const uploadErr = await uploadRes.text();
        throw new Error(`LinkedIn binary upload failed: ${uploadErr}`);
      }

      // Step 3: Configure UGC Post with media
      shareMediaCategory = media.isVideo ? "VIDEO" : "IMAGE";
      const titleText = input.caption.split("\n")[0].slice(0, 95) || "Cadence Post";
      mediaArray = [
        {
          status: "READY",
          description: { text: message },
          media: assetUrn,
          title: { text: titleText },
        },
      ];
    }

    const shareContent: Record<string, unknown> = {
      shareCommentary: { text: message },
      shareMediaCategory,
    };
    if (mediaArray) {
      shareContent.media = mediaArray;
    }

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
          "com.linkedin.ugc.ShareContent": shareContent,
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
    const ugcId = data.id || `li_${Date.now()}`;

    // Step 4: First-comment publishing for LinkedIn
    if (input.firstComment?.trim()) {
      try {
        const commentRes = await fetch(
          `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(ugcId)}/comments`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              "X-Restli-Protocol-Version": "2.0.0",
            },
            body: JSON.stringify({
              actor: author,
              message: {
                text: input.firstComment.trim(),
              },
            }),
          }
        );
        if (!commentRes.ok) {
          const errText = await commentRes.text();
          console.warn(`[LinkedIn First Comment Warning] Post ${ugcId} comment failed: ${errText}`);
        } else {
          console.log(`[LinkedIn First Comment Success] Comment posted to ${ugcId}`);
        }
      } catch (cErr) {
        console.warn(`[LinkedIn First Comment Exception]`, cErr);
      }
    }

    return { externalId: ugcId };
  },
};

const youtubeAdapter: SocialAdapter = {
  async publish(input) {
    const accessToken = await resolveAccessToken(input.account);
    const message = formatMessage(input.caption, input.hashtags);
    let title = input.title || input.caption.split("\n")[0].slice(0, 95) || "Cadence Post";

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
      throw new Error("YouTube only supports video uploads (MP4, MOV). Please remove YouTube from this post or attach a video asset.");
    }

    const videoUrl = input.mediaUrls[0];
    const media = await readMediaPayload(videoUrl);
    if (!media.isVideo || media.contentType?.startsWith("image/")) {
      throw new Error("YouTube only supports video uploads (MP4, MOV). Please remove YouTube from this post or attach a video asset.");
    }
    const videoBuffer = media.buffer;
    const contentType = media.contentType || "video/mp4";

    let description = formatMessage(input.caption, input.hashtags);
    const tags = [...input.hashtags];

    const classification = classifyYouTubeVideo(input.mediaAsset || { originalUrl: videoUrl });
    if (classification.isShort) {
      if (!title.toLowerCase().includes("#shorts")) {
        title = `${title} #Shorts`.slice(0, 100);
      }
      if (!description.toLowerCase().includes("#shorts")) {
        description = `${description}\n\n#Shorts`.trim();
      }
      if (!tags.includes("Shorts")) tags.push("Shorts");
      if (!tags.includes("YouTubeShorts")) tags.push("YouTubeShorts");
    }

    const metadata = {
      snippet: {
        title,
        description,
        tags,
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
    const accessToken = await resolveAccessToken(input.account);
    const message = formatMessage(input.caption, input.hashtags);

    if (isSimulatedAccount(input.account, accessToken)) {
      console.log(`[SIMULATION: X / Twitter @${input.account.accountName}] Publishing tweet:`, {
        message,
        mediaUrls: input.mediaUrls,
      });
      await new Promise((r) => setTimeout(r, 600));
      return { externalId: `sim_x_${Date.now()}` };
    }

    let mediaId: string | undefined;

    if (input.mediaUrls && input.mediaUrls.length > 0) {
      const media = await readMediaPayload(input.mediaUrls[0]);

      // Step 1: INIT chunked media upload
      const initParams = new URLSearchParams({
        command: "INIT",
        total_bytes: String(media.buffer.byteLength),
        media_type: media.contentType,
        media_category: media.isVideo ? "tweet_video" : "tweet_image",
      });

      const initRes = await fetch("https://upload.twitter.com/1.1/media/upload.json", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: initParams.toString(),
      });

      if (!initRes.ok) {
        const initErr = await initRes.text();
        throw new Error(`Twitter media INIT failed: ${initErr}`);
      }

      const initData = (await initRes.json()) as { media_id_string?: string };
      mediaId = initData.media_id_string;
      if (!mediaId) {
        throw new Error("Twitter media INIT did not return media_id_string");
      }

      // Step 2: APPEND binary chunk
      const appendFormData = new FormData();
      appendFormData.append("command", "APPEND");
      appendFormData.append("media_id", mediaId);
      appendFormData.append("segment_index", "0");
      const bytes = new Uint8Array(media.buffer.length);
      bytes.set(media.buffer);
      appendFormData.append("media", new Blob([bytes], { type: media.contentType }));

      const appendRes = await fetch("https://upload.twitter.com/1.1/media/upload.json", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: appendFormData,
      });

      if (!appendRes.ok) {
        const appendErr = await appendRes.text();
        throw new Error(`Twitter media APPEND failed: ${appendErr}`);
      }

      // Step 3: FINALIZE media upload
      const finalizeParams = new URLSearchParams({
        command: "FINALIZE",
        media_id: mediaId,
      });

      const finalizeRes = await fetch("https://upload.twitter.com/1.1/media/upload.json", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: finalizeParams.toString(),
      });

      if (!finalizeRes.ok) {
        const finalizeErr = await finalizeRes.text();
        throw new Error(`Twitter media FINALIZE failed: ${finalizeErr}`);
      }
    }

    const tweetPayload: { text: string; media?: { media_ids: string[] } } = {
      text: message,
    };
    if (mediaId) {
      tweetPayload.media = { media_ids: [mediaId] };
    }

    const res = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tweetPayload),
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

