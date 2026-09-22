import { describe, it, expect } from "vitest";
import {
  POST_STATUS_ORDER, POST_STATUS_ADVANCE_SEQUENCE, POST_STATUS_LABELS, ROLE_LABELS,
} from "./roles";
import type { PostStatus, Role } from "@prisma/client";

const ALL_STATUSES: PostStatus[] = [
  "IDEA", "BRIEFED", "IN_DESIGN", "IN_COPYWRITING", "INTERNAL_REVIEW",
  "REVISION", "CLIENT_REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED", "FAILED",
];
const ALL_ROLES: Role[] = ["ADMIN", "MANAGER", "WRITER", "DESIGNER", "CLIENT_REVIEWER"];

describe("POST_STATUS_ORDER", () => {
  it("contains every PostStatus exactly once — this is the kanban column list", () => {
    expect([...POST_STATUS_ORDER].sort()).toEqual([...ALL_STATUSES].sort());
    expect(new Set(POST_STATUS_ORDER).size).toBe(POST_STATUS_ORDER.length);
  });
});

describe("POST_STATUS_ADVANCE_SEQUENCE", () => {
  it("excludes the two side branches, REVISION and FAILED", () => {
    expect(POST_STATUS_ADVANCE_SEQUENCE).not.toContain("REVISION");
    expect(POST_STATUS_ADVANCE_SEQUENCE).not.toContain("FAILED");
  });

  it("only ever moves forward through POST_STATUS_ORDER — the Advance button can't skip backwards", () => {
    const positions = POST_STATUS_ADVANCE_SEQUENCE.map((s) => POST_STATUS_ORDER.indexOf(s));
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });
});

describe("labels", () => {
  it("has a label for every status and every role — a missing one renders as undefined in the UI", () => {
    for (const status of ALL_STATUSES) expect(POST_STATUS_LABELS[status]).toBeTruthy();
    for (const role of ALL_ROLES) expect(ROLE_LABELS[role]).toBeTruthy();
  });
});
