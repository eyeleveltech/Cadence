import "server-only";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { auth } from "./auth";
import { prisma } from "./prisma";
import type { Role } from "@prisma/client";

/** Every role that works inside the agency, i.e. everyone except the
 * client's own reviewer. */
export const TEAM_ROLES = ["ADMIN", "MANAGER", "WRITER", "DESIGNER"] as const satisfies readonly Role[];

/** Raw session lookup — returns null if signed out. Use in layouts/pages
 * that need to branch on auth state without forcing a redirect. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Use in any server component/action that requires a signed-in user. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user;
}

/**
 * Use when an action is restricted to specific roles — e.g. only ADMIN
 * can delete a client, only MANAGER+ can approve internally.
 *
 * Denies with a 404, not a 403: an authorization failure shouldn't
 * confirm to the caller that the thing they were trying to reach even
 * exists. This also means it renders as a clean "not found" page
 * instead of crashing into Next's generic error boundary, which a bare
 * `throw` would do in a server component.
 */
export async function requireRole(...allowed: Role[]) {
  const user = await requireUser();
  if (!allowed.includes(user.role as Role)) {
    notFound();
  }
  return user;
}

/**
 * Scopes access to a single client workspace. Admins and managers see
 * every client; writers, designers and client reviewers only see
 * clients they've been explicitly assigned to via ClientMember —
 * this is the boundary that keeps a client reviewer from ever seeing
 * another client's posts. Same 404-not-403 reasoning as requireRole.
 *
 * This grants the *client reviewer* level of access. Almost nothing
 * should use it directly: a reviewer belongs in /review, not in the
 * internal workspace. Reach for requireClientWorkspaceAccess instead
 * unless the thing you're guarding is genuinely part of the review
 * portal.
 */
export async function requireClientAccess(clientId: string) {
  const user = await requireUser();

  if (user.role === "ADMIN" || user.role === "MANAGER") {
    return user;
  }

  const membership = await prisma.clientMember.findUnique({
    where: { clientId_userId: { clientId, userId: user.id } },
  });

  if (!membership) {
    notFound();
  }

  return user;
}

/**
 * The internal workspace boundary: client access *and* an agency role.
 *
 * A client reviewer has a ClientMember row — that's what puts their
 * brand's posts in their review queue — so membership alone doesn't
 * separate "the client's person" from "our team". Every internal read
 * and write (the plan, the library, boards, comms, brand kit) goes
 * through here, because a layout redirect only hides the UI: server
 * actions are reachable directly, and their ids ship in the client
 * bundle.
 */
export async function requireClientWorkspaceAccess(clientId: string) {
  const user = await requireClientAccess(clientId);
  if (user.role === "CLIENT_REVIEWER") {
    notFound();
  }
  return user;
}

/** True for the two roles that can act across every client. */
export function isLeadership(role: string) {
  return role === "ADMIN" || role === "MANAGER";
}
