import { createHmac, timingSafeEqual } from "crypto";

/**
 * Meta's `signed_request`: base64url(signature).base64url(payload),
 * signed with the app secret.
 *
 * Used by the Data Deletion Callback, where the whole point of the
 * signature is that an unverified request must not be able to make us
 * delete anything. Kept out of the route file so the verification can be
 * tested directly rather than through an HTTP handler.
 */
export type MetaSignedRequest = {
  user_id?: string;
  algorithm?: string;
  issued_at?: number;
};

export function parseSignedRequest(
  signedRequest: string,
  appSecret: string,
): MetaSignedRequest | null {
  if (!signedRequest || !appSecret) return null;

  const [encodedSig, encodedPayload] = signedRequest.split(".");
  if (!encodedSig || !encodedPayload) return null;

  try {
    const expected = createHmac("sha256", appSecret).update(encodedPayload).digest();
    const actual = Buffer.from(encodedSig, "base64url");

    // Constant time: a fast-exit compare on a signature leaks it a byte
    // at a time to anyone willing to measure.
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as MetaSignedRequest;

    // Meta only signs with HMAC-SHA256; anything else is someone else.
    if (payload.algorithm && payload.algorithm.toUpperCase() !== "HMAC-SHA256") return null;

    return payload;
  } catch {
    return null;
  }
}

/** Builds one, for tests and for exercising the callback locally. */
export function buildSignedRequest(payload: MetaSignedRequest, appSecret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", appSecret).update(encodedPayload).digest("base64url");
  return `${signature}.${encodedPayload}`;
}
