import "server-only";
import { createHmac, createHash, randomBytes, timingSafeEqual } from "crypto";
import type { PlatformSlug } from "./oauth";

const STATE_TTL_MS = 10 * 60 * 1000;

export type StatePayload = {
  clientId: string;
  platform: PlatformSlug;
  sid: string;
  ts: number;
  codeVerifier?: string;
  returnTo?: string;
};

/**
 * Generates an RFC 7636-compliant high-entropy cryptographic code verifier.
 * 32 random bytes produces a 43-character base64url string (valid range: 43-128 chars).
 */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Computes the S256 code challenge for an RFC 7636 code verifier:
 * BASE64URL(SHA256(ASCII(code_verifier))).
 */
export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

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
 * Includes an optional PKCE code_verifier for platforms like Twitter/X,
 * ensuring the verifier is cryptographically bound to the user session
 * and returned untampered to the callback without extra session cookies.
 */
export function signOAuthState(
  clientId: string,
  platform: PlatformSlug,
  sessionId: string,
  codeVerifier?: string,
  returnTo?: string,
): string {
  const payload: StatePayload = {
    clientId,
    platform,
    sid: sessionId,
    ts: Date.now(),
    ...(codeVerifier ? { codeVerifier } : {}),
    ...(returnTo ? { returnTo } : {}),
  };
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
