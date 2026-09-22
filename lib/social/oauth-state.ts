import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import type { PlatformSlug } from "./oauth";

const STATE_TTL_MS = 10 * 60 * 1000;

type StatePayload = { clientId: string; platform: PlatformSlug; sid: string; ts: number };

function sign(data: string): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set — required to sign the OAuth state param.");
  return createHmac("sha256", secret).update(data).digest("base64url");
}

/**
 * Signed, stateless CSRF token for the OAuth round trip — no DB row to
 * clean up, and a tampered clientId/platform fails verification instead
 * of silently connecting the wrong client's account.
 *
 * The session id is in the payload and checked on the way back, which is
 * the part that makes this a CSRF token rather than a signature. Signed
 * with a server-wide secret alone, any state minted by any admin was
 * valid in anyone's callback for the next ten minutes — long enough to
 * walk an admin onto a callback URL carrying someone else's `code` and
 * bind an attacker's Page to the client.
 */
export function signOAuthState(clientId: string, platform: PlatformSlug, sessionId: string): string {
  const payload: StatePayload = { clientId, platform, sid: sessionId, ts: Date.now() };
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${json}.${sign(json)}`;
}

/** Returns the payload only for the same session that started the flow. */
export function verifyOAuthState(state: string, sessionId: string): StatePayload | null {
  const [json, signature] = state.split(".");
  if (!json || !signature) return null;

  const expected = sign(json);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(json, "base64url").toString("utf8")) as StatePayload;
    if (Date.now() - payload.ts > STATE_TTL_MS) return null;
    if (!payload.sid || payload.sid !== sessionId) return null;
    return payload;
  } catch {
    return null;
  }
}
