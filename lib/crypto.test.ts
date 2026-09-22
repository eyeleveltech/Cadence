import { describe, it, expect, beforeAll } from "vitest";
import { encryptToken, decryptToken } from "./crypto";

// Platform access tokens are the most dangerous thing this app stores:
// they post to a client's real accounts. These pin the properties that
// make storing them defensible at all.
beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = "test-key-not-a-real-secret";
});

describe("token encryption", () => {
  it("round-trips a token", () => {
    const secret = "EAAG...a-real-looking-long-lived-page-token";
    expect(decryptToken(encryptToken(secret))).toBe(secret);
  });

  it("never emits the plaintext in the stored value", () => {
    const secret = "super-secret-access-token";
    expect(encryptToken(secret)).not.toContain(secret);
  });

  it("uses a fresh IV, so the same token encrypts differently every time", () => {
    const secret = "same-token-twice";
    expect(encryptToken(secret)).not.toBe(encryptToken(secret));
  });

  it("rejects a tampered ciphertext rather than returning garbage", () => {
    const [iv, tag, ciphertext] = encryptToken("tamper-me").split(":");
    const flipped = Buffer.from(ciphertext, "base64");
    flipped[0] ^= 0xff;
    expect(() => decryptToken(`${iv}:${tag}:${flipped.toString("base64")}`)).toThrow();
  });

  it("rejects a swapped auth tag", () => {
    const [iv, , ciphertext] = encryptToken("first").split(":");
    const [, otherTag] = encryptToken("second").split(":");
    expect(() => decryptToken(`${iv}:${otherTag}:${ciphertext}`)).toThrow();
  });

  it("rejects a malformed value instead of half-decrypting it", () => {
    expect(() => decryptToken("not-an-encrypted-token")).toThrow(/Malformed/);
  });

  it("refuses to work with no key configured", () => {
    const key = process.env.TOKEN_ENCRYPTION_KEY;
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(() => encryptToken("x")).toThrow(/TOKEN_ENCRYPTION_KEY/);
    process.env.TOKEN_ENCRYPTION_KEY = key;
  });
});
