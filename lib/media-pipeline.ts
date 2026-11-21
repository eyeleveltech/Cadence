// Shared with the standalone worker process — no "server-only" guard.
import sharp from "sharp";
import child_process from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { storage } from "./storage";
import type { VariantKind } from "@prisma/client";

function runExecFile(file: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    child_process.execFile(file, args, (error, stdout, stderr) => {
      if (error) return reject(error);
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

/**
 * Platform APIs reject non-conforming media rather than adapting it —
 * Instagram's feed endpoint refuses PNG outright, for instance — so
 * conversion has to happen here before anything reaches a platform.
 * Images are processed synchronously on upload since sharp is fast and
 * needs no external service. Video transcoding (ffmpeg, for Reels and
 * Story video caps) runs either via BullMQ worker job or direct fallback.
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
 * Resolves the ffmpeg binary to execute:
 * 1. process.env.FFMPEG_PATH if provided
 * 2. ffmpeg-static npm package if installed
 * 3. System "ffmpeg" executable in PATH
 */
export function resolveFfmpegPath(): string {
  if (process.env.FFMPEG_PATH && process.env.FFMPEG_PATH.trim()) {
    return process.env.FFMPEG_PATH.trim();
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-implied-eval
    const req = eval("require");
    const ffmpegStatic = req("ffmpeg-static");
    if (ffmpegStatic && typeof ffmpegStatic === "string") {
      return ffmpegStatic;
    }
  } catch {
    // ignore
  }
  return "ffmpeg";
}

let cachedFfmpegAvailable: boolean | null = null;

/**
 * Checks whether ffmpeg is available on the host system.
 * Caches the result to avoid repeated child process spawns.
 */
export async function isFfmpegAvailable(): Promise<boolean> {
  if (cachedFfmpegAvailable !== null) {
    return cachedFfmpegAvailable;
  }
  const ffmpegPath = resolveFfmpegPath();
  try {
    await runExecFile(ffmpegPath, ["-version"]);
    cachedFfmpegAvailable = true;
    return true;
  } catch {
    cachedFfmpegAvailable = false;
    return false;
  }
}

/** Reset cache for unit testing */
export function resetFfmpegCache(): void {
  cachedFfmpegAvailable = null;
}

/**
 * Transcodes video assets into platform-ready variants:
 * 1. 9:16 Vertical Video (STORY_9X16 / REEL_MP4): 1080x1920 H.264/AAC MP4 with faststart.
 * 2. Video Thumbnail (THUMBNAIL): Extracted JPEG frame at 00:00:01.000 (scaled to 640px width).
 *
 * If FFmpeg is unavailable, logs a warning and returns [] so the original upload remains READY.
 */
export async function processVideoAsset(
  clientId: string,
  assetId: string,
  originalBuffer: Buffer,
): Promise<GeneratedVariant[]> {
  const available = await isFfmpegAvailable();
  if (!available) {
    console.warn(
      `[media-pipeline] FFmpeg is not available on this host. Skipping video transcoding for asset ${assetId}.`,
    );
    return [];
  }

  const ffmpegPath = resolveFfmpegPath();
  const tmpDir = os.tmpdir();
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const inputPath = path.join(tmpDir, `cadence_input_${assetId}_${randomSuffix}.mp4`);
  const verticalPath = path.join(tmpDir, `cadence_vertical_${assetId}_${randomSuffix}.mp4`);
  const thumbPath = path.join(tmpDir, `cadence_thumb_${assetId}_${randomSuffix}.jpg`);

  try {
    await fs.promises.writeFile(inputPath, originalBuffer);

    // 1. Transcode 9:16 vertical variant (H.264 / AAC .mp4 with faststart)
    await runExecFile(ffmpegPath, [
      "-y",
      "-i",
      inputPath,
      "-vf",
      "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      verticalPath,
    ]);

    // 2. Extract video poster/thumbnail at 00:00:01.000
    await runExecFile(ffmpegPath, [
      "-y",
      "-ss",
      "00:00:01.000",
      "-i",
      inputPath,
      "-vframes",
      "1",
      "-vf",
      "scale=640:-2",
      thumbPath,
    ]);

    const variants: GeneratedVariant[] = [];

    // Read and save vertical variant
    const verticalBuffer = await fs.promises.readFile(verticalPath);
    const verticalKey = `${clientId}/${assetId}/story_9_16.mp4`;
    const verticalUrl = await storage.save(verticalKey, verticalBuffer, "video/mp4");
    variants.push({
      kind: "STORY_9X16",
      url: verticalUrl,
      width: 1080,
      height: 1920,
      fileSizeBytes: verticalBuffer.byteLength,
    });
    variants.push({
      kind: "REEL_MP4",
      url: verticalUrl,
      width: 1080,
      height: 1920,
      fileSizeBytes: verticalBuffer.byteLength,
    });

    // Read and save thumbnail
    const thumbBuffer = await fs.promises.readFile(thumbPath);
    const thumbKey = `${clientId}/${assetId}/thumb.jpg`;
    const thumbUrl = await storage.save(thumbKey, thumbBuffer, "image/jpeg");
    variants.push({
      kind: "THUMBNAIL",
      url: thumbUrl,
      width: 640,
      height: 360,
      fileSizeBytes: thumbBuffer.byteLength,
    });

    return variants;
  } finally {
    // Cleanup temporary files
    await Promise.all([
      fs.promises.unlink(inputPath).catch(() => {}),
      fs.promises.unlink(verticalPath).catch(() => {}),
      fs.promises.unlink(thumbPath).catch(() => {}),
    ]);
  }
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

export { ensurePublicMediaUrl, uploadToCloudinary } from "./storage";

