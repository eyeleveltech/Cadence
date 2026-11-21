import { describe, it, expect, beforeAll, vi, afterEach } from "vitest";
import {
  signOAuthState,
  verifyOAuthState,
  generateCodeVerifier,
  generateCodeChallenge,
} from "./oauth-state";

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = "test-secret-not-a-real-one";
});

afterEach(() => {
  vi.useRealTimers();
});

const SESSION = "session-abc";
const OTHER_SESSION = "session-xyz";

describe("OAuth state & PKCE", () => {
  describe("PKCE helper functions (RFC 7636)", () => {
    it("generates an unreserved 43-character base64url code_verifier", () => {
      const verifier = generateCodeVerifier();
      expect(verifier).toHaveLength(43);
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("computes the correct S256 code_challenge matching base64url(sha256(verifier))", () => {
      const verifier = "dBjftJeZ4CVP-mKDnhIqR_Bekjn3D36161330374274";
      const expectedChallenge = "VFTPxISi7InFvgTherbqCp5N4u03Bc77iDnTBX9vPQg";
      expect(generateCodeChallenge(verifier)).toBe(expectedChallenge);
    });
  });

  describe("OAuth state signing and verification", () => {
    it("round-trips the client and platform for the session that started it", () => {
      const state = signOAuthState("client-1", "instagram", SESSION);
      const payload = verifyOAuthState(state, SESSION);

      expect(payload?.clientId).toBe("client-1");
      expect(payload?.platform).toBe("instagram");
      expect(payload?.codeVerifier).toBeUndefined();
    });

    it("round-trips PKCE code_verifier securely in the signed state", () => {
      const verifier = generateCodeVerifier();
      const state = signOAuthState("client-1", "twitter", SESSION, verifier);
      const payload = verifyOAuthState(state, SESSION);

      expect(payload?.clientId).toBe("client-1");
      expect(payload?.platform).toBe("twitter");
      expect(payload?.codeVerifier).toBe(verifier);
    });

    it("rejects a state minted for a different session", () => {
      const state = signOAuthState("client-1", "instagram", OTHER_SESSION);
      expect(verifyOAuthState(state, SESSION)).toBeNull();
    });

    it("rejects a tampered clientId", () => {
      const state = signOAuthState("client-1", "instagram", SESSION);
      const [json, signature] = state.split(".");

      const payload = JSON.parse(Buffer.from(json, "base64url").toString("utf8"));
      payload.clientId = "someone-elses-client";
      const forged = Buffer.from(JSON.stringify(payload)).toString("base64url");

      expect(verifyOAuthState(`${forged}.${signature}`, SESSION)).toBeNull();
    });

    it("rejects a tampered code_verifier", () => {
      const verifier = generateCodeVerifier();
      const state = signOAuthState("client-1", "twitter", SESSION, verifier);
      const [json, signature] = state.split(".");

      const payload = JSON.parse(Buffer.from(json, "base64url").toString("utf8"));
      payload.codeVerifier = "tampered-verifier-attacker-controlled";
      const forged = Buffer.from(JSON.stringify(payload)).toString("base64url");

      expect(verifyOAuthState(`${forged}.${signature}`, SESSION)).toBeNull();
    });

    it("rejects a state with no signature at all", () => {
      const json = Buffer.from(
        JSON.stringify({ clientId: "c", platform: "instagram", sid: SESSION, ts: Date.now() }),
      ).toString("base64url");

      expect(verifyOAuthState(json, SESSION)).toBeNull();
      expect(verifyOAuthState(`${json}.`, SESSION)).toBeNull();
    });

    it("expires after ten minutes", () => {
      vi.useFakeTimers();
      const state = signOAuthState("client-1", "instagram", SESSION);

      vi.advanceTimersByTime(9 * 60 * 1000);
      expect(verifyOAuthState(state, SESSION)).not.toBeNull();

      vi.advanceTimersByTime(2 * 60 * 1000);
      expect(verifyOAuthState(state, SESSION)).toBeNull();
    });

    it("rejects junk without throwing", () => {
      for (const junk of ["", ".", "a.b", "!!!.???"]) {
        expect(verifyOAuthState(junk, SESSION)).toBeNull();
      }
    });
  });
});
