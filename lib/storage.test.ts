import { describe, it, expect } from "vitest";
import path from "path";
import { resolveMediaPath, MEDIA_URL_PREFIX } from "./storage";

/**
 * Storage keys are built from ids we generate, so nothing here should
 * ever fire in practice — which is exactly why it's worth pinning: the
 * cost of the check is nothing and the cost of being wrong is writing
 * outside the media root.
 */
describe("resolveMediaPath", () => {
  it("resolves an ordinary key under the media root", () => {
    const resolved = resolveMediaPath("client123/asset456/original.jpg");
    expect(resolved).not.toBeNull();
    expect(resolved).toContain(`asset456${path.sep}original.jpg`);
  });

  it("refuses a key that climbs out of the root", () => {
    for (const key of [
      "../../etc/passwd",
      "client/../../../../etc/passwd",
      "..\\..\\windows\\system32",
      "client/./asset/original.jpg",
    ]) {
      expect(resolveMediaPath(key)).toBeNull();
    }
  });

  it("refuses an empty key or one carrying a null byte", () => {
    expect(resolveMediaPath("")).toBeNull();
    expect(resolveMediaPath("client/asset/orig\0.jpg")).toBeNull();
  });

  it("tolerates a doubled separator — harmless, and not worth refusing", () => {
    expect(resolveMediaPath("client//asset/original.jpg")).not.toBeNull();
  });

  it("refuses an absolute path outright", () => {
    expect(resolveMediaPath("/etc/passwd")).toBeNull();
    expect(resolveMediaPath("C:\\Windows\\System32\\config")).toBeNull();
  });
});

describe("media URLs", () => {
  it("points at the authorizing route, not the public directory", () => {
    // The whole reason uploads moved: /media/... was served statically by
    // Next with no session check at all.
    expect(MEDIA_URL_PREFIX).toBe("/api/media");
  });
});
