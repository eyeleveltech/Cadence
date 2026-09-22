import "server-only";
import sharp from "sharp";
import { storage } from "./storage";
import type { VariantKind } from "@prisma/client";

/**
 * Platform APIs reject non-conforming media rather than adapting it —
 * Instagram's feed endpoint refuses PNG outright, for instance — so
 * conversion has to happen here before anything reaches a platform.
 * Images are processed synchronously on upload since sharp is fast and
 * needs no external service. Video transcoding (ffmpeg, for Reels and
 * Story video caps) is a Phase 2 worker job — see worker/ — because it's
 * slow enough to need a queue rather than blocking the request.
 */

export interface GeneratedVariant {
  kind: VariantKind;
  url: string;
  width: number;
  height: number;
  fileSizeBytes: number;
}

const FEED_TARGET = { width: 1080, height: 1350 }; // 4:5, the safest Instagram feed ratio
const STORY_TARGET = { width: 1080, height: 1920 }; // 9:16

export async function processImageAsset(
  clientId: string,
  assetId: string,
  originalBuffer: Buffer,
): Promise<GeneratedVariant[]> {
  const variants: GeneratedVariant[] = [];

  const feedBuffer = await sharp(originalBuffer)
    .resize(FEED_TARGET.width, FEED_TARGET.height, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } }) // JPEG has no alpha channel
    .jpeg({ quality: 90 })
    .toBuffer();

  const feedKey = `${clientId}/${assetId}/feed.jpg`;
  const feedUrl = await storage.save(feedKey, feedBuffer, "image/jpeg");
  variants.push({
    kind: "FEED_JPEG",
    url: feedUrl,
    width: FEED_TARGET.width,
    height: FEED_TARGET.height,
    fileSizeBytes: feedBuffer.byteLength,
  });

  const storyBuffer = await sharp(originalBuffer)
    .resize(STORY_TARGET.width, STORY_TARGET.height, {
      fit: "cover",
      position: "attention", // smart-crop toward the busiest part of the image
    })
    .jpeg({ quality: 90 })
    .toBuffer();

  const storyKey = `${clientId}/${assetId}/story.jpg`;
  const storyUrl = await storage.save(storyKey, storyBuffer, "image/jpeg");
  variants.push({
    kind: "STORY_9X16",
    url: storyUrl,
    width: STORY_TARGET.width,
    height: STORY_TARGET.height,
    fileSizeBytes: storyBuffer.byteLength,
  });

  const thumbBuffer = await sharp(originalBuffer)
    .resize(400, 400, { fit: "cover" })
    .jpeg({ quality: 80 })
    .toBuffer();

  const thumbKey = `${clientId}/${assetId}/thumb.jpg`;
  const thumbUrl = await storage.save(thumbKey, thumbBuffer, "image/jpeg");
  variants.push({
    kind: "THUMBNAIL",
    url: thumbUrl,
    width: 400,
    height: 400,
    fileSizeBytes: thumbBuffer.byteLength,
  });

  return variants;
}

/**
 * Doubles as the "is this really an image?" check on upload. sharp reads
 * the actual bytes, so `format` is what the file is, not what its name or
 * its Content-Type claimed — both of which the uploader controls. Throws
 * for anything sharp can't decode; callers treat that as a rejection.
 */
export async function readImageMetadata(buffer: Buffer) {
  const meta = await sharp(buffer).metadata();
  return {
    format: meta.format ?? null,
    width: meta.width ?? null,
    height: meta.height ?? null,
  };
}
