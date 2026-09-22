// Shared with the standalone worker process — no "server-only" guard.
import type { ConnectionStatus, TokenType } from "@prisma/client";

/**
 * Connection health.
 *
 * `connectionStatus` used to be written exactly once, as CONNECTED, and
 * never again — which meant the worker's health sweep, whose query is
 * `connectionStatus: { not: "CONNECTED" }`, could never match a row.
 * A token could expire or a client could withdraw access and the first
 * anyone heard of it was a post failing to go out. This is the logic
 * that actually moves a connection off CONNECTED.
 */

/** How long before expiry we start asking for a reconnect. Long enough
 * that someone can act on it during a working week. */
export const EXPIRY_WARNING_DAYS = 7;

export type HealthInput = {
  tokenType: TokenType;
  tokenExpiresAt: Date | null;
  /** Result of a live call to the platform, when one was possible. */
  probe?: { valid: boolean; detail?: string };
};

export type HealthVerdict = {
  status: ConnectionStatus;
  detail: string | null;
};

/**
 * Pure: given what we know about a connection, what state is it in?
 * Kept free of I/O so the rules are testable without a platform account,
 * which matters because none of this can be exercised end to end until
 * the Meta app clears review.
 */
export function assessConnection(input: HealthInput, now: Date = new Date()): HealthVerdict {
  // A live rejection is the strongest signal we have, and it outranks
  // any expiry arithmetic.
  if (input.probe && !input.probe.valid) {
    const detail = input.probe.detail ?? "The platform rejected this token.";
    // An expired credential can be fixed by reconnecting; a withdrawn
    // permission cannot — the client has to re-grant it. Telling those
    // apart is the difference between a two-minute fix and a phone call.
    return {
      status: looksLikePermissionLoss(detail) ? "PERMISSION_MISSING" : "NEEDS_RECONNECT",
      detail,
    };
  }

  // Page and system-user tokens don't expire, so an expiry date on one
  // is meaningless and must not be acted on.
  if (input.tokenType !== "USER" || !input.tokenExpiresAt) {
    return { status: "CONNECTED", detail: null };
  }

  const msLeft = input.tokenExpiresAt.getTime() - now.getTime();
  if (msLeft <= 0) {
    return { status: "NEEDS_RECONNECT", detail: "The access token has expired." };
  }

  const daysLeft = Math.floor(msLeft / (24 * 60 * 60 * 1000));
  if (daysLeft <= EXPIRY_WARNING_DAYS) {
    return {
      status: "NEEDS_RECONNECT",
      detail: `The access token expires in ${daysLeft === 0 ? "less than a day" : `${daysLeft} day${daysLeft === 1 ? "" : "s"}`}.`,
    };
  }

  return { status: "CONNECTED", detail: null };
}

/** Platforms don't return a machine-readable "you were un-shared" code,
 * so this reads the message. Wrong guesses are survivable: both statuses
 * surface the same warning, they just word the fix differently. */
function looksLikePermissionLoss(detail: string): boolean {
  const text = detail.toLowerCase();
  return (
    text.includes("permission") ||
    text.includes("not authorized") ||
    text.includes("unauthorized") ||
    text.includes("does not have") ||
    text.includes("scope")
  );
}

export const STATUS_LABEL: Record<ConnectionStatus, string> = {
  CONNECTED: "Connected",
  NEEDS_RECONNECT: "Needs reconnect",
  PERMISSION_MISSING: "Access withdrawn",
  REVOKED: "Revoked",
};
