import { describe, it, expect } from "vitest";
import { assessConnection, EXPIRY_WARNING_DAYS } from "./health";

const NOW = new Date("2026-09-19T12:00:00Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

describe("assessConnection", () => {
  it("leaves a healthy user token alone", () => {
    const v = assessConnection({ tokenType: "USER", tokenExpiresAt: inDays(60) }, NOW);
    expect(v).toEqual({ status: "CONNECTED", detail: null });
  });

  it("flags a user token that has already expired", () => {
    const v = assessConnection({ tokenType: "USER", tokenExpiresAt: inDays(-1) }, NOW);
    expect(v.status).toBe("NEEDS_RECONNECT");
    expect(v.detail).toMatch(/expired/i);
  });

  it("warns before expiry, not after — the whole point is catching it early", () => {
    const v = assessConnection({ tokenType: "USER", tokenExpiresAt: inDays(EXPIRY_WARNING_DAYS - 1) }, NOW);
    expect(v.status).toBe("NEEDS_RECONNECT");
    expect(v.detail).toMatch(/expires in/i);
  });

  it("stays quiet just outside the warning window", () => {
    const v = assessConnection({ tokenType: "USER", tokenExpiresAt: inDays(EXPIRY_WARNING_DAYS + 2) }, NOW);
    expect(v.status).toBe("CONNECTED");
  });

  // This is the reason tokenType exists. A Page token derived from a
  // long-lived user token doesn't expire, so acting on a stale expiry
  // date would nag about a connection that is perfectly fine.
  it("ignores expiry on PAGE and SYSTEM_USER tokens", () => {
    for (const tokenType of ["PAGE", "SYSTEM_USER"] as const) {
      expect(assessConnection({ tokenType, tokenExpiresAt: inDays(-100) }, NOW).status).toBe("CONNECTED");
    }
  });

  it("treats a user token with no expiry recorded as healthy", () => {
    expect(assessConnection({ tokenType: "USER", tokenExpiresAt: null }, NOW).status).toBe("CONNECTED");
  });

  it("a live rejection outranks a perfectly good expiry date", () => {
    const v = assessConnection(
      { tokenType: "USER", tokenExpiresAt: inDays(60), probe: { valid: false, detail: "Session expired" } },
      NOW,
    );
    expect(v.status).toBe("NEEDS_RECONNECT");
  });

  it("separates a withdrawn permission from an expired token", () => {
    // Reconnecting fixes one and cannot fix the other, so the distinction
    // is what the notification tells someone to go and do.
    const withdrawn = assessConnection(
      { tokenType: "PAGE", tokenExpiresAt: null, probe: { valid: false, detail: "The user has not granted permission" } },
      NOW,
    );
    expect(withdrawn.status).toBe("PERMISSION_MISSING");

    const expired = assessConnection(
      { tokenType: "USER", tokenExpiresAt: null, probe: { valid: false, detail: "Error validating access token" } },
      NOW,
    );
    expect(expired.status).toBe("NEEDS_RECONNECT");
  });

  it("passes a successful probe through", () => {
    const v = assessConnection(
      { tokenType: "PAGE", tokenExpiresAt: null, probe: { valid: true } },
      NOW,
    );
    expect(v).toEqual({ status: "CONNECTED", detail: null });
  });
});
