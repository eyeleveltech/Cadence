import type { Role, PostStatus, CommType } from "@prisma/client";

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  WRITER: "Writer",
  DESIGNER: "Designer",
  CLIENT_REVIEWER: "Client",
};

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  IDEA: "Idea",
  BRIEFED: "Briefed",
  IN_DESIGN: "In Design",
  IN_COPYWRITING: "Copywriting",
  INTERNAL_REVIEW: "Internal Review",
  REVISION: "Revision",
  CLIENT_REVIEW: "Client Review",
  APPROVED: "Approved",
  SCHEDULED: "Scheduled",
  PUBLISHED: "Published",
  FAILED: "Failed",
};

// Order matters — this is the left-to-right column order on the kanban board.
export const POST_STATUS_ORDER: PostStatus[] = [
  "IDEA", "BRIEFED", "IN_DESIGN", "IN_COPYWRITING", "INTERNAL_REVIEW",
  "REVISION", "CLIENT_REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED", "FAILED",
];

// REVISION and FAILED are side-branches reached by an explicit action
// (a revision request, a failed publish attempt) — never a forward step,
// so the "Advance" button's sequence excludes them.
export const POST_STATUS_ADVANCE_SEQUENCE: PostStatus[] = [
  "IDEA", "BRIEFED", "IN_DESIGN", "IN_COPYWRITING", "INTERNAL_REVIEW",
  "CLIENT_REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED",
];

export const COMM_TYPE_LABELS: Record<CommType, string> = {
  CALL: "Call",
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  MEETING: "Meeting",
  BRIEF_UPDATE: "Brief Update",
};

// ───────────────────── Post status transitions ─────────────────────
// The board used to accept any status for any post, which meant a card
// could be dragged straight from IDEA to SCHEDULED and the worker would
// publish it — no approval, no caption check. These rules are the server
// side of that; the board only mirrors them.

/** Stages where the work is still being drafted internally. A planner
 * moves cards freely among these, in either direction — that back and
 * forth between design, copy and internal review is the actual job. */
export const DRAFTING_STATUSES: PostStatus[] = [
  "IDEA", "BRIEFED", "IN_DESIGN", "IN_COPYWRITING", "INTERNAL_REVIEW", "REVISION",
];

/** Set by the publishing worker from the outcome of a real API call —
 * never by a person, or the board would claim things went live that
 * never did. */
export const WORKER_ONLY_STATUSES: PostStatus[] = ["PUBLISHED", "FAILED"];

/** Statuses that commit the agency to something: showing work to the
 * client, signing it off, or handing it to the publisher. Restricted to
 * leadership — see canSetPostStatus. */
export const LEADERSHIP_ONLY_STATUSES: PostStatus[] = ["APPROVED", "SCHEDULED"];

function draftingExcept(status: PostStatus): PostStatus[] {
  return DRAFTING_STATUSES.filter((s) => s !== status);
}

export const POST_STATUS_TRANSITIONS: Record<PostStatus, PostStatus[]> = {
  IDEA: draftingExcept("IDEA"),
  BRIEFED: draftingExcept("BRIEFED"),
  IN_DESIGN: draftingExcept("IN_DESIGN"),
  IN_COPYWRITING: draftingExcept("IN_COPYWRITING"),
  REVISION: draftingExcept("REVISION"),
  // Internal sign-off is the gate in front of the client seeing anything.
  INTERNAL_REVIEW: [...draftingExcept("INTERNAL_REVIEW"), "CLIENT_REVIEW"],
  CLIENT_REVIEW: ["REVISION", "INTERNAL_REVIEW", "APPROVED"],
  APPROVED: ["SCHEDULED", "CLIENT_REVIEW", "REVISION"],
  // Pulling a scheduled post back is a normal, urgent thing to need.
  SCHEDULED: ["APPROVED", "REVISION"],
  // Terminal: it's live on the platform, the board can't undo that.
  PUBLISHED: [],
  // A failed publish is retried by rescheduling it, or sent back for a fix.
  FAILED: ["SCHEDULED", "APPROVED", "REVISION"],
};

export function isValidPostTransition(from: PostStatus, to: PostStatus): boolean {
  return POST_STATUS_TRANSITIONS[from].includes(to);
}

export type StatusChangeRefusal = "worker-only" | "leadership-only" | "invalid-transition";

/** Why a status change isn't allowed, or null when it is. Pure, so the
 * board can grey out a column with exactly the rule the action enforces. */
export function refusePostStatusChange(
  from: PostStatus,
  to: PostStatus,
  role: Role,
): StatusChangeRefusal | null {
  if (WORKER_ONLY_STATUSES.includes(to)) return "worker-only";
  if (!isValidPostTransition(from, to)) return "invalid-transition";
  if (LEADERSHIP_ONLY_STATUSES.includes(to) && role !== "ADMIN" && role !== "MANAGER") {
    return "leadership-only";
  }
  return null;
}

export const STATUS_REFUSAL_MESSAGE: Record<StatusChangeRefusal, string> = {
  "worker-only": "Published and Failed are set by the publisher from a real API call, not by hand.",
  "leadership-only": "Only an admin or manager can approve or schedule a post.",
  "invalid-transition": "That isn't a step this post can take from where it is.",
};
