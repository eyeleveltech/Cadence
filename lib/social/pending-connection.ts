import "server-only";
import { cookies } from "next/headers";
import { encryptToken, decryptToken } from "@/lib/crypto";
import type { PlatformSlug } from "./oauth";

const COOKIE = "cadence_pending_connection";
const TTL_SECONDS = 10 * 60;

export type PendingConnection = {
  clientId: string;
  platform: PlatformSlug;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
};

/**
 * Holds the freshly exchanged token between the OAuth callback and the
 * account picker.
 *
 * When one login administers several Pages we can't save anything yet —
 * someone has to say which one belongs to this client. That leaves a
 * token in hand with nowhere to put it for the length of one redirect.
 * It goes in an httpOnly cookie, encrypted with the same AES-256-GCM
 * used for tokens at rest, because a platform access token in a
 * plaintext cookie is publish access to a client's brand sitting in the
 * browser. Ten minutes, then it's dead.
 */
export async function setPendingConnection(pending: PendingConnection) {
  const jar = await cookies();
  jar.set(COOKIE, encryptToken(JSON.stringify(pending)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function readPendingConnection(): Promise<PendingConnection | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;

  try {
    return JSON.parse(decryptToken(raw)) as PendingConnection;
  } catch {
    // Tampered, or encrypted under a rotated key — either way it's not
    // something to act on.
    return null;
  }
}

export async function clearPendingConnection() {
  const jar = await cookies();
  jar.delete(COOKIE);
}
