"use server";

import { randomBytes } from "crypto";
import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/session";
import { sendTeamInviteEmail } from "@/lib/email";
import type { Role } from "@prisma/client";

const TEAM_ROLES = ["ADMIN", "MANAGER", "WRITER", "DESIGNER"] as const satisfies readonly Role[];

/** Every org member, for the admin roster and the "add existing person to
 * this client" picker. Admin/manager only — this is the full hierarchy. */
export async function listAllUsers() {
  await requireRole("ADMIN", "MANAGER");
  return prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      _count: { select: { clientMemberships: true } },
    },
  });
}

const updateRoleSchema = z.object({
  userId: z.string(),
  role: z.enum(TEAM_ROLES),
});

/** Promote/demote within the hierarchy. Admin only — role is the one
 * field that decides what a person can see and do across every client. */
export async function updateUserRole(input: z.infer<typeof updateRoleSchema>) {
  const admin = await requireRole("ADMIN");
  const { userId, role } = updateRoleSchema.parse(input);

  if (userId === admin.id && role !== "ADMIN") {
    throw new Error("You can't remove your own admin access — ask another admin to do it.");
  }

  const user = await prisma.user.update({ where: { id: userId }, data: { role } });

  await prisma.auditLog.create({
    data: { userId: admin.id, action: "USER_ROLE_CHANGED", entityType: "User", entityId: userId, metadata: { role } },
  });

  revalidatePath("/team");
  return user;
}

const inviteTeamMemberSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  role: z.enum(TEAM_ROLES),
});

/** Creates a real sign-in account (email + a one-time temp password,
 * mirroring exactly how the seed script provisions the team) and emails
 * it. Admin only. */
export async function inviteTeamMember(input: z.infer<typeof inviteTeamMemberSchema>) {
  const admin = await requireRole("ADMIN");
  const { name, email, role } = inviteTeamMemberSchema.parse(input);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("Someone with that email already has an account.");

  const tempPassword = randomBytes(9).toString("base64url");
  const result = await auth.api.signUpEmail({ body: { name, email, password: tempPassword } });
  await prisma.user.update({ where: { id: result.user.id }, data: { role } });

  await sendTeamInviteEmail(email, { name, tempPassword });

  await prisma.auditLog.create({
    data: { userId: admin.id, action: "TEAM_MEMBER_INVITED", entityType: "User", entityId: result.user.id, metadata: { email, role } },
  });

  revalidatePath("/team");
  return { id: result.user.id };
}

const inviteClientReviewerSchema = z.object({
  clientId: z.string().cuid(),
  name: z.string().min(2).max(120),
  email: z.string().email(),
});

/** Creates (or reuses) a CLIENT_REVIEWER account and grants it access to
 * exactly one client. No password — they always sign in with a magic
 * link, so there's nothing to leak or forget. This is the one flow that
 * puts a client's own person into Cadence. */
export async function inviteClientReviewer(input: z.infer<typeof inviteClientReviewerSchema>) {
  const admin = await requireRole("ADMIN", "MANAGER");
  const { clientId, name, email } = inviteClientReviewerSchema.parse(input);

  await prisma.client.findUniqueOrThrow({ where: { id: clientId } }); // 404s the action if the client doesn't exist

  let user = await prisma.user.findUnique({ where: { email } });
  if (user && user.role !== "CLIENT_REVIEWER") {
    throw new Error(`${user.name} already has a ${user.role.toLowerCase()} account — client access is only for reviewers.`);
  }
  if (!user) {
    user = await prisma.user.create({ data: { name, email, role: "CLIENT_REVIEWER", emailVerified: false } });
  }

  await prisma.clientMember.upsert({
    where: { clientId_userId: { clientId, userId: user.id } },
    create: { clientId, userId: user.id },
    update: {},
  });

  // Sends an actual, clickable magic link — not just word that access was
  // granted — landing straight on their review queue once they use it.
  await auth.api.signInMagicLink({
    body: { email, name, callbackURL: "/review" },
    headers: await headers(),
  });

  await prisma.auditLog.create({
    data: { userId: admin.id, action: "CLIENT_REVIEWER_INVITED", entityType: "Client", entityId: clientId, metadata: { email } },
  });

  revalidatePath(`/clients/${clientId}/settings`);
  return user;
}

const removeMemberSchema = z.object({
  clientId: z.string().cuid(),
  userId: z.string(),
});

/** Revokes one person's access to one client — the other half of "give
 * access to the client". Doesn't touch their account or other clients. */
export async function removeClientMember(input: z.infer<typeof removeMemberSchema>) {
  const admin = await requireRole("ADMIN", "MANAGER");
  const { clientId, userId } = removeMemberSchema.parse(input);

  await prisma.clientMember.delete({ where: { clientId_userId: { clientId, userId } } });

  await prisma.auditLog.create({
    data: { userId: admin.id, action: "CLIENT_MEMBER_REMOVED", entityType: "Client", entityId: clientId, metadata: { removedUserId: userId } },
  });

  revalidatePath(`/clients/${clientId}/settings`);
}
