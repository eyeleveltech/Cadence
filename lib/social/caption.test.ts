import { describe, it, expect } from "vitest";
import { isCustomCaptions, parseCustomCaptions, resolvePlatformCaption } from "./caption";

describe("Caption Parsing & Per-Platform Resolution (lib/social/caption.ts)", () => {
  it("detects standard plain text captions as non-custom", () => {
    const plain = "Hello world! Check out our new update.";
    expect(isCustomCaptions(plain)).toBe(false);
    expect(parseCustomCaptions(plain)).toBeNull();

    const resolved = resolvePlatformCaption(plain, "TWITTER", "Fallback Title");
    expect(resolved.caption).toBe(plain);
    expect(resolved.title).toBe("Fallback Title");
  });

  it("handles null or undefined captions gracefully", () => {
    expect(isCustomCaptions(null)).toBe(false);
    expect(isCustomCaptions(undefined)).toBe(false);
    expect(parseCustomCaptions(null)).toBeNull();
    expect(parseCustomCaptions(undefined)).toBeNull();

    const resolved = resolvePlatformCaption(null, "INSTAGRAM", "My Title");
    expect(resolved.caption).toBe("");
    expect(resolved.title).toBe("My Title");
  });

  it("identifies and parses serialized custom caption payload", () => {
    const customPayload = JSON.stringify({
      _custom: true,
      default: "Default caption",
      TWITTER: "Short tweet copy",
      INSTAGRAM: "Instagram copy with hashtags",
      FACEBOOK: "Long form Facebook post",
      LINKEDIN: "Professional update for LinkedIn network",
      YOUTUBE: "Full video description for YouTube viewers",
      YOUTUBE_TITLE: "Custom YouTube Video Title",
    });

    expect(isCustomCaptions(customPayload)).toBe(true);

    const parsed = parseCustomCaptions(customPayload);
    expect(parsed).not.toBeNull();
    expect(parsed?.TWITTER).toBe("Short tweet copy");
    expect(parsed?.YOUTUBE_TITLE).toBe("Custom YouTube Video Title");
  });

  it("resolves per-platform tailored captions correctly", () => {
    const customPayload = JSON.stringify({
      _custom: true,
      default: "Default fallback copy",
      TWITTER: "Twitter tweet text",
      INSTAGRAM: "Instagram caption",
      YOUTUBE: "YouTube description text",
      YOUTUBE_TITLE: "Tailored YouTube Title",
    });

    const twitterRes = resolvePlatformCaption(customPayload, "TWITTER", "Default Title");
    expect(twitterRes.caption).toBe("Twitter tweet text");
    expect(twitterRes.title).toBe("Default Title");

    const igRes = resolvePlatformCaption(customPayload, "INSTAGRAM", "Default Title");
    expect(igRes.caption).toBe("Instagram caption");

    const ytRes = resolvePlatformCaption(customPayload, "YOUTUBE", "Default Title");
    expect(ytRes.caption).toBe("YouTube description text");
    expect(ytRes.title).toBe("Tailored YouTube Title");

    // Platform without specific override falls back to 'default' in payload
    const fbRes = resolvePlatformCaption(customPayload, "FACEBOOK", "Default Title");
    expect(fbRes.caption).toBe("Default fallback copy");
  });

  it("handles corrupted or invalid JSON safely without throwing", () => {
    const invalidJson = "{ _custom: true, broken ";
    expect(isCustomCaptions(invalidJson)).toBe(false);
    expect(parseCustomCaptions(invalidJson)).toBeNull();

    const resolved = resolvePlatformCaption(invalidJson, "TWITTER", "Fallback");
    expect(resolved.caption).toBe(invalidJson);
  });
});
