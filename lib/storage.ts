import "server-only";
import { mkdir, writeFile, unlink, readFile, rm } from "fs/promises";
import path from "path";

/**
 * Storage is behind an interface on purpose: local disk today, Cloudflare
 * R2 in production (see the plan — S3-compatible, no egress fees). Swap
 * the export at the bottom for an R2 implementation once credentials
 * exist; nothing above this file needs to change.
 *
 * Note what changed and why: this used to write into `public/`, which
 * Next serves statically with no session check, so every client's
 * unreleased creative was readable by anyone who had (or guessed) the
 * URL — and an uploaded .html would have run as a page on our own
 * origin. Files now live outside the web root and are served by
 * app/api/media/[...key], which authorizes the client first. Keep it
 * that way: an R2 implementation should hand back private-bucket keys,
 * not public URLs.
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

/**
 * Resolve a storage key to a path and refuse anything that climbs out of
 * the root. Keys are built from ids we control, so this should never
 * fire — which is exactly why it's cheap to keep as a backstop.
 */
export function resolveMediaPath(key: string): string | null {
  if (!key || key.includes("\0")) return null;
  if (path.isAbsolute(key) || /^[a-zA-Z]:/.test(key)) return null;

  // Refuse a malformed key outright rather than normalising it into
  // something valid. Stripping the `..` out of client/../../../etc/passwd
  // leaves etc/passwd — still inside the root, but no longer the file
  // anyone asked for, and a silent rewrite is a worse answer than "no".
  const segments = key.split(/[/\\]+/);
  if (segments.some((s) => s === "" || s === "." || s === "..")) return null;

  const root = path.resolve(LOCAL_ROOT);
  const full = path.resolve(root, ...segments);
  if (full !== root && !full.startsWith(root + path.sep)) return null;

  return full;
}

class LocalDiskStorage implements StorageAdapter {
  async save(key: string, data: Buffer): Promise<string> {
    const destPath = resolveMediaPath(key);
    if (!destPath) throw new Error(`Refusing to write outside the media root: ${key}`);

    await mkdir(path.dirname(destPath), { recursive: true });
    await writeFile(destPath, data);
    return `${MEDIA_URL_PREFIX}/${key}`;
  }

  async read(key: string): Promise<Buffer | null> {
    const srcPath = resolveMediaPath(key);
    if (!srcPath) return null;

    try {
      return await readFile(srcPath);
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const destPath = resolveMediaPath(key);
    if (!destPath) return;

    await unlink(destPath).catch(() => {
      // already gone — fine, delete is idempotent
    });
  }

  async deletePrefix(prefix: string): Promise<void> {
    const dir = resolveMediaPath(prefix);
    if (!dir) return;

    await rm(dir, { recursive: true, force: true }).catch(() => {
      // nothing there — same idempotence as delete
    });
  }
}

// TODO(Phase 2 infra): swap for an R2Storage implementation
// (@aws-sdk/client-s3 pointed at the R2 S3-compatible endpoint) once
// R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are set. Use a
// private bucket and keep serving through the media route, or sign
// short-lived URLs — a public bucket puts us back where we started.
export const storage: StorageAdapter = new LocalDiskStorage();
