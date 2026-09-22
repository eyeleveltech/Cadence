import { describe, it, expect, beforeAll, vi, afterEach } from "vitest";
import { signOAuthState, verifyOAuthState } from "./oauth-state";

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = "test-secret-not-a-real-one";
});

afterEach(() => {
  vi.useRealTimers();
});

const SESSION = "session-abc";
const OTHER_SESSION = "session-xyz";

describe("OAuth state", () => {
  it("round-trips the client and platform for the session that started it", () => {
    const state = signOAuthState("client-1", "instagram", SESSION);
    const payload = verifyOAuthState(state, SESSION);

    expect(payload?.clientId).toBe("client-1");
    expect(payload?.platform).toBe("instagram");
  });

  it("rejects a state minted for a different session", () => {
    // This is the account-injection case: a state signed with the
    // server-wide secret used to be valid in anybody's callback, so an
    // attacker's flow could be completed inside an admin's session and
    // bind the attacker's page to the client.
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
