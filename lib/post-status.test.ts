import { describe, it, expect } from "vitest";
import {
  POST_STATUS_ORDER,
  POST_STATUS_TRANSITIONS,
  DRAFTING_STATUSES,
  WORKER_ONLY_STATUSES,
  isValidPostTransition,
  refusePostStatusChange,
} from "./roles";
import type { PostStatus, Role } from "@prisma/client";

const EVERY_ROLE: Role[] = ["ADMIN", "MANAGER", "WRITER", "DESIGNER", "CLIENT_REVIEWER"];
const NON_LEADERSHIP: Role[] = ["WRITER", "DESIGNER", "CLIENT_REVIEWER"];

describe("POST_STATUS_TRANSITIONS", () => {
  it("covers every status, so no post can reach a state with undefined rules", () => {
    for (const status of POST_STATUS_ORDER) {
      expect(POST_STATUS_TRANSITIONS[status]).toBeDefined();
    }
  });

  it("never lists a status as a transition out of itself", () => {
    for (const [from, targets] of Object.entries(POST_STATUS_TRANSITIONS)) {
      expect(targets).not.toContain(from as PostStatus);
    }
  });

  it("treats PUBLISHED as terminal — the board can't undo a live post", () => {
    expect(POST_STATUS_TRANSITIONS.PUBLISHED).toEqual([]);
  });
});

describe("refusePostStatusChange", () => {
  it("refuses PUBLISHED and FAILED from anyone, admins included", () => {
    for (const to of WORKER_ONLY_STATUSES) {
      for (const role of EVERY_ROLE) {
        expect(refusePostStatusChange("SCHEDULED", to, role)).toBe("worker-only");
      }
    }
  });

  it("refuses the jump the old board allowed: straight from IDEA to SCHEDULED", () => {
    expect(refusePostStatusChange("IDEA", "SCHEDULED", "ADMIN")).toBe("invalid-transition");
    expect(isValidPostTransition("IDEA", "SCHEDULED")).toBe(false);
  });

  it("refuses scheduling work the client has never approved", () => {
    expect(refusePostStatusChange("INTERNAL_REVIEW", "SCHEDULED", "ADMIN")).toBe("invalid-transition");
    expect(refusePostStatusChange("CLIENT_REVIEW", "SCHEDULED", "ADMIN")).toBe("invalid-transition");
  });

  it("lets an admin schedule an approved post", () => {
    expect(refusePostStatusChange("APPROVED", "SCHEDULED", "ADMIN")).toBeNull();
    expect(refusePostStatusChange("APPROVED", "SCHEDULED", "MANAGER")).toBeNull();
  });

  it("keeps approving and scheduling away from writers, designers and the client", () => {
    for (const role of NON_LEADERSHIP) {
      expect(refusePostStatusChange("APPROVED", "SCHEDULED", role)).toBe("leadership-only");
      expect(refusePostStatusChange("CLIENT_REVIEW", "APPROVED", role)).toBe("leadership-only");
    }
  });

  it("lets anyone on the team move work around the drafting stages", () => {
    for (const from of DRAFTING_STATUSES) {
      for (const to of DRAFTING_STATUSES) {
        if (from === to) continue;
        expect(refusePostStatusChange(from, to, "WRITER")).toBeNull();
      }
    }
  });

  it("allows pulling a scheduled post back, which is the urgent case", () => {
    expect(refusePostStatusChange("SCHEDULED", "APPROVED", "MANAGER")).toBeNull();
    expect(refusePostStatusChange("SCHEDULED", "REVISION", "MANAGER")).toBeNull();
  });

  it("allows retrying a failed publish by rescheduling it", () => {
    expect(refusePostStatusChange("FAILED", "SCHEDULED", "ADMIN")).toBeNull();
  });

  it("never lets a published post be dragged back into the pipeline", () => {
    for (const to of POST_STATUS_ORDER) {
      if (to === "PUBLISHED") continue;
      expect(refusePostStatusChange("PUBLISHED", to, "ADMIN")).not.toBeNull();
    }
  });
});
