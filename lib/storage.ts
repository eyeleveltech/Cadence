// Shared with the standalone worker process — no "server-only" guard.
import fs from "fs";
import { mkdir, writeFile, unlink, readFile, rm } from "fs/promises";
import path from "path";
import { v2 as cloudinary } from "cloudinary";

/**
 * Storage is behind an interface on purpose: local disk today, Cloudflare
 * R2 in production (see the plan — S3-compatible, no egress fees). Swap
 * the export at the bottom for an R2 implementation once credentials
 * exist; nothing above this file needs to change.
 *
 * Files live outside the web root and are served by app/api/media/[...key],
 * which authorizes the client first.
 */
export interface StorageAdapter {
  save(key: string, data: Buffer, contentType: string): Promise<string>;
  read(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  /** Removes an asset's whole folder — original plus every variant. */
  deletePrefix(prefix: string): Promise<void>;
}

/** Deliberately outside `public/`. Override for a mounted volume. */
const LOCAL_ROOT = process.env.MEDIA_ROOT
  ? path.resolve(process.env.MEDIA_ROOT)
  : path.join(process.cwd(), "var", "media");

/** The route that authorizes and streams these back. */
export const MEDIA_URL_PREFIX = "/api/media";

/** Strips any leading /api/media prefix and query strings so URLs can be read back as storage keys. */
export function normalizeMediaKey(key: string): string {
  let cleaned = key.trim().split("?")[0];
  if (cleaned.startsWith(`${MEDIA_URL_PREFIX}/`)) {
    cleaned = cleaned.slice(MEDIA_URL_PREFIX.length + 1);
  } else if (cleaned.startsWith(MEDIA_URL_PREFIX)) {
    cleaned = cleaned.slice(MEDIA_URL_PREFIX.length);
  } else if (cleaned.startsWith("/")) {
    cleaned = cleaned.slice(1);
  }
  return cleaned;
}

/**
 * Resolve a storage key to a path and refuse anything that climbs out of
 * the root. Keys are built from ids we control, so this should never
 * fire — which is exactly why it's cheap to keep as a backstop.
 */
export function resolveMediaPath(key: string): string | null {
  if (!key || key.includes("\0")) return null;
  if (path.isAbsolute(key) || /^[a-zA-Z]:/.test(key)) return null;

  const segments = key.split(/[/\\]+/);
  if (segments.some((s) => s === "" || s === "." || s === "..")) return null;

  const root = path.resolve(LOCAL_ROOT);
  const full = path.resolve(root, ...segments);
  if (full !== root && !full.startsWith(root + path.sep)) return null;

  return full;
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_URL ||
    (process.env.CLOUDINARY_CLOUD_NAME &&
     process.env.CLOUDINARY_API_KEY &&
     process.env.CLOUDINARY_API_SECRET)
  );
}

export function configureCloudinary(): boolean {
  if (
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  ) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME.trim(),
      api_key: process.env.CLOUDINARY_API_KEY.trim(),
      api_secret: process.env.CLOUDINARY_API_SECRET.trim(),
      secure: true,
    });
    return true;
  }
  if (process.env.CLOUDINARY_URL) {
    try {
      const parsed = new URL(process.env.CLOUDINARY_URL.trim());
      cloudinary.config({
        cloud_name: parsed.hostname || parsed.host,
        api_key: parsed.username,
        api_secret: parsed.password,
        secure: true,
      });
      return true;
    } catch {
      cloudinary.config(true);
      return true;
    }
  }
  return false;
}

export class LocalDiskStorage implements StorageAdapter {
  async save(key: string, data: Buffer): Promise<string> {
    const destPath = resolveMediaPath(normalizeMediaKey(key));
    if (!destPath) throw new Error(`Refusing to write outside the media root: ${key}`);

    await mkdir(path.dirname(destPath), { recursive: true });
    await writeFile(destPath, data);
    return `${MEDIA_URL_PREFIX}/${normalizeMediaKey(key)}`;
  }

  async read(key: string): Promise<Buffer | null> {
    if (!key) return null;

    // 1. Direct path check if absolute and exists
    try {
      if (path.isAbsolute(key) && fs.existsSync(key)) {
        return await readFile(key);
      }
    } catch {}

    // 2. Resolved media root path
    const srcPath = resolveMediaPath(normalizeMediaKey(key));
    if (srcPath) {
      try {
        if (fs.existsSync(srcPath)) {
          return await readFile(srcPath);
        }
      } catch {}
    }

    return null;
  }

  async delete(key: string): Promise<void> {
    const destPath = resolveMediaPath(normalizeMediaKey(key));
    if (!destPath) return;

    await unlink(destPath).catch(() => {
      // already gone — fine, delete is idempotent
    });
  }

  async deletePrefix(prefix: string): Promise<void> {
    const dir = resolveMediaPath(normalizeMediaKey(prefix));
    if (!dir) return;

    await rm(dir, { recursive: true, force: true }).catch(() => {
      // nothing there — same idempotence as delete
    });
  }
}

export class CloudinaryStorage implements StorageAdapter {
  private local: LocalDiskStorage;

  constructor() {
    this.local = new LocalDiskStorage();
    configureCloudinary();
  }

  async save(key: string, data: Buffer, contentType: string): Promise<string> {
    // 0. If already public HTTPS (and not localhost), bypass re-uploading and use directly
    if (key.startsWith("https://") && !key.includes("localhost") && !key.includes("127.0.0.1")) {
      return key;
    }

    // 1. Always write to local disk first so local file, variants, and /api/media routes succeed
    let localUrl = "";
    try {
      localUrl = await this.local.save(key, data);
    } catch (localErr) {
      console.error(`[storage:local] Error writing local copy for ${key}:`, localErr);
    }

    // 2. If Cloudinary is configured, attempt uploading to Cloudinary
    if (isCloudinaryConfigured()) {
      try {
        configureCloudinary();
        const cleanPublicId = `cadence/${normalizeMediaKey(key).replace(/\.[^/.]+$/, "")}`;
        const resourceType = contentType?.startsWith("video/") ? "video" : "auto";

        const uploadedUrl = await new Promise<string>((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              public_id: cleanPublicId,
              resource_type: resourceType,
              overwrite: true,
              invalidate: true,
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
          uploadStream.end(data);
        });

        console.log(`[storage:cloudinary] Successfully uploaded ${key} to Cloudinary: ${uploadedUrl}`);
        return uploadedUrl;
      } catch (err: unknown) {
        const errDetails = err as { message?: string; http_code?: number; name?: string } | undefined;
        console.error("[Cloudinary Upload Error Details]:", {
          message: errDetails?.message,
          http_code: errDetails?.http_code,
          name: errDetails?.name,
          cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        });
        console.error(`[storage:cloudinary] Cloudinary upload failed for ${key}:`, err);
        console.warn(`[storage] Falling back to local disk storage for key: ${key}`);
      }
    }

    if (localUrl) return localUrl;
    return await this.local.save(key, data);
  }

  async read(key: string): Promise<Buffer | null> {
    if (!key) return null;

    // 1. If key is an HTTP/HTTPS URL
    if (key.startsWith("http://") || key.startsWith("https://")) {
      // If it's a localhost /api/media URL, resolve locally first
      try {
        const parsed = new URL(key);
        if (parsed.pathname.startsWith(`${MEDIA_URL_PREFIX}/`)) {
          const localBuf = await this.local.read(parsed.pathname);
          if (localBuf) return localBuf;
        }
      } catch {}

      try {
        const res = await fetch(key);
        if (res.ok) {
          const arrayBuf = await res.arrayBuffer();
          return Buffer.from(arrayBuf);
        }
      } catch (err) {
        console.warn(`[storage:read] Failed to fetch remote URL ${key}:`, err);
      }
    }

    // 2. Check local disk first (fastest and most reliable)
    const localBuf = await this.local.read(key);
    if (localBuf) return localBuf;

    // 3. If not found locally, try Cloudinary
    if (isCloudinaryConfigured()) {
      try {
        configureCloudinary();
        const cleanPublicId = `cadence/${normalizeMediaKey(key).replace(/\.[^/.]+$/, "")}`;
        const cloudinaryUrl = cloudinary.url(cleanPublicId, { secure: true });
        const res = await fetch(cloudinaryUrl);
        if (res.ok) {
          const arrayBuf = await res.arrayBuffer();
          return Buffer.from(arrayBuf);
        }
      } catch (err) {
        console.warn(`[storage:read] Failed to fetch from Cloudinary for ${key}:`, err);
      }
    }

    return null;
  }

  async delete(key: string): Promise<void> {
    await this.local.delete(key);
    if (isCloudinaryConfigured()) {
      try {
        configureCloudinary();
        const cleanPublicId = `cadence/${normalizeMediaKey(key).replace(/\.[^/.]+$/, "")}`;
        await cloudinary.uploader.destroy(cleanPublicId);
      } catch {}
    }
  }

  async deletePrefix(prefix: string): Promise<void> {
    await this.local.deletePrefix(prefix);
    if (isCloudinaryConfigured()) {
      try {
        configureCloudinary();
        await cloudinary.api.delete_resources_by_prefix(`cadence/${normalizeMediaKey(prefix)}`);
      } catch {}
    }
  }
}

/** Unified storage instance that handles local disk storage with optional Cloudinary public bridge */
export const storage: StorageAdapter = isCloudinaryConfigured()
  ? new CloudinaryStorage()
  : new LocalDiskStorage();

export async function readMedia(keyOrUrl: string): Promise<Buffer | null> {
  return storage.read(keyOrUrl);
}

export async function getMediaBuffer(keyOrUrl: string): Promise<Buffer> {
  const buf = await storage.read(keyOrUrl);
  if (!buf) {
    throw new Error(`Failed to read media from storage: ${keyOrUrl}`);
  }
  return buf;
}

/**
 * Uploads an asset buffer to Cloudinary, ensuring proper credentials and stream handling.
 */
export async function uploadToCloudinary(assetUrl: string, filename?: string): Promise<string> {
  if (!isCloudinaryConfigured()) return assetUrl;
  configureCloudinary();

  const buffer = await readMedia(assetUrl);
  if (!buffer) return assetUrl;

  const ext = filename
    ? path.extname(filename)
    : assetUrl.includes(".")
      ? path.extname(assetUrl.split("?")[0])
      : ".jpg";
  const cleanName = filename ? filename.replace(/\.[^/.]+$/, "") : `cadence_pub_${Date.now()}`;
  const key = `cadence/${cleanName}${ext}`;
  const isVideo = ext === ".mp4" || ext === ".mov" || ext === ".webm";

  return await storage.save(key, buffer, isVideo ? "video/mp4" : "image/jpeg");
}

/**
 * Asset-level caching & idempotency:
 * If already hosted on Cloudinary (or a public HTTPS origin), skip network upload completely.
 * Otherwise, uploads local/blob buffer and caches/returns the public HTTPS URL.
 */
export async function ensurePublicMediaUrl(assetUrl: string, filename?: string): Promise<string> {
  // If already hosted on Cloudinary, skip network upload completely
  if (assetUrl.startsWith("https://res.cloudinary.com")) {
    return assetUrl;
  }
  if (
    assetUrl.startsWith("https://") &&
    !assetUrl.includes("localhost") &&
    !assetUrl.includes("127.0.0.1")
  ) {
    return assetUrl;
  }
  // Upload local/blob buffer only if not yet hosted
  return await uploadToCloudinary(assetUrl, filename);
}

