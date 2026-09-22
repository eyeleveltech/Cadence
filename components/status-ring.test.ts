import { describe, it, expect } from "vitest";
import { STAGE_COLOR } from "./status-ring";
import { POST_STATUS_ORDER } from "@/lib/roles";

describe("STAGE_COLOR", () => {
  it("assigns exactly the four phase hues the ring's legend promises", () => {
    const hues = new Set(Object.values(STAGE_COLOR));
    expect(hues).toEqual(new Set(["#2A4BD7", "#B0620F", "#1B7F4B", "#BF2E2E"]));
  });

  it("colors every status the ring can render, including both side branches", () => {
    for (const status of POST_STATUS_ORDER) {
      expect(STAGE_COLOR[status]).toBeDefined();
    }
  });

  it("keeps REVISION on the review hue — it's a side branch off Internal Review, not progress", () => {
    expect(STAGE_COLOR.REVISION).toBe(STAGE_COLOR.INTERNAL_REVIEW);
  });
});
