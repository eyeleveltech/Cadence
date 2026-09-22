import type { PostStatus } from "@prisma/client";
import { POST_STATUS_LABELS } from "@/lib/roles";
import { cn } from "cn";

// The ring is the one mark every post carries, from calendar chip to
// phone card. Fill is progress through the nine forward stages. Hue is
// the phase: cobalt while the team is producing, amber while a decision
// is waited on, green once approved, red when a publish failed. Revision
// is a side branch — it keeps Internal Review's fill and adds a center
// dot rather than advancing. Nothing else in the product uses these
// hues, so a glance at any list says where the work is.
const STAGE_INDEX: Record<PostStatus, number> = {
  IDEA: 1,
  BRIEFED: 2,
  IN_DESIGN: 3,
  IN_COPYWRITING: 4,
  INTERNAL_REVIEW: 5,
  REVISION: 5,
  CLIENT_REVIEW: 6,
  APPROVED: 7,
  SCHEDULED: 8,
  PUBLISHED: 9,
  FAILED: 9,
};

export const STAGE_COLOR: Record<PostStatus, string> = {
  IDEA: "#2A4BD7",
  BRIEFED: "#2A4BD7",
  IN_DESIGN: "#2A4BD7",
  IN_COPYWRITING: "#2A4BD7",
  INTERNAL_REVIEW: "#B0620F",
  CLIENT_REVIEW: "#B0620F",
  REVISION: "#B0620F",
  APPROVED: "#1B7F4B",
  SCHEDULED: "#1B7F4B",
  PUBLISHED: "#1B7F4B",
  FAILED: "#BF2E2E",
};

const CIRCUMFERENCE = 2 * Math.PI * 6; // r=6 in a 16x16 viewBox

export function StatusRing({
  status,
  size = 16,
  className,
}: {
  status: PostStatus;
  size?: number;
  className?: string;
}) {
  const filled = ((STAGE_INDEX[status] / 9) * CIRCUMFERENCE).toFixed(2);
  const color = STAGE_COLOR[status];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-label={POST_STATUS_LABELS[status]}
      className={cn("shrink-0", className)}
    >
      <circle cx="8" cy="8" r="6" fill="none" stroke="var(--ring-track)" strokeWidth="2" />
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeDasharray={`${filled} ${CIRCUMFERENCE.toFixed(2)}`}
        transform="rotate(-90 8 8)"
        strokeLinecap={status === "FAILED" ? "butt" : "round"}
      />
      {status === "PUBLISHED" && (
        <path
          d="M5.3 8.2l1.9 1.9 3.5-4.1"
          fill="none"
          stroke={color}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {status === "FAILED" && (
        <path d="M6 6l4 4M10 6l-4 4" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      )}
      {status === "REVISION" && <circle cx="8" cy="8" r="2" fill={color} />}
    </svg>
  );
}

export function StatusChip({
  status,
  className,
}: {
  status: PostStatus;
  className?: string;
}) {
  return (
    <span className={cn("om-chip", className)}>
      <StatusRing status={status} size={15} />
      {POST_STATUS_LABELS[status]}
    </span>
  );
}
