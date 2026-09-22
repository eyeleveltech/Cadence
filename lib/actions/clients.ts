"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireClientWorkspaceAccess, requireRole, requireUser } from "@/lib/session";

/** Admins and managers see every client. Writers, designers and client
 * reviewers only see clients they're assigned to. */
export async function listClientsForCurrentUser() {
  const user = await requireUser();
  // Feeds the internal sidebar; a reviewer has no internal sidebar.
  if (user.role === "CLIENT_REVIEWER") return [];

  if (user.role === "ADMIN" || user.role === "MANAGER") {
    return prisma.client.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { posts: true } } },
    });
  }

  return prisma.client.findMany({
    where: { members: { some: { userId: user.id } } },
    orderBy: { name: "asc" },
    include: { _count: { select: { posts: true } } },
  });
}

const createClientSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "lowercase letters, numbers and hyphens only"),
  toneOfVoice: z.string().max(500).optional(),
});

export async function createClient(input: z.infer<typeof createClientSchema>) {
  const user = await requireRole("ADMIN");
  const data = createClientSchema.parse(input);

  const client = await prisma.client.create({ data });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "CLIENT_CREATED",
      entityType: "Client",
      entityId: client.id,
      metadata: { name: client.name },
    },
  });

  revalidatePath("/clients");
  return client;
}

const updateBrandKitSchema = z.object({
  clientId: z.string().cuid(),
  toneOfVoice: z.string().max(2000).optional(),
  brandColors: z.array(z.string().regex(/^#[0-9a-fA-F]{3,8}$/, "must be a hex color like #0F172A")).max(12).default([]),
});

/** Tone of voice and brand colors — reference material every writer and
 * designer on the client pulls from, not access control, so anyone with
 * client access can update it. */
export async function updateClientBrandKit(input: z.infer<typeof updateBrandKitSchema>) {
  const data = updateBrandKitSchema.parse(input);
  await requireClientWorkspaceAccess(data.clientId);

  await prisma.client.update({
    where: { id: data.clientId },
    data: {
      toneOfVoice: data.toneOfVoice?.trim() || null,
      brandColors: data.brandColors,
    },
  });

  revalidatePath(`/clients/${data.clientId}/settings`);
}

const addMemberSchema = z.object({
  clientId: z.string().cuid(),
  userId: z.string(),
});

export async function addClientMember(input: z.infer<typeof addMemberSchema>) {
  const admin = await requireRole("ADMIN", "MANAGER");
  const { clientId, userId } = addMemberSchema.parse(input);

  // Both ids come straight from the caller. An unknown one would fail on
  // a foreign key deep in the upsert; say so plainly instead.
  const [client, user] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } }),
  ]);
  if (!client) throw new Error("That client doesn't exist.");
  if (!user) throw new Error("That person doesn't have an account yet.");
  if (user.role === "CLIENT_REVIEWER") {
    throw new Error("Use the client reviewer invite to give a client's own people access.");
  }

  const membership = await prisma.clientMember.upsert({
    where: { clientId_userId: { clientId, userId } },
    create: { clientId, userId },
    update: {},
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "CLIENT_MEMBER_ADDED",
      entityType: "Client",
      entityId: clientId,
      metadata: { addedUserId: userId },
    },
  });

  revalidatePath(`/clients/${clientId}/settings`);
  return membership;
}

const setStatusSchema = z.object({
  clientId: z.string().cuid(),
  status: z.enum(["ACTIVE", "PAUSED", "CHURNED"]),
});

/**
 * Pause or close a client.
 *
 * ClientStatus has been rendered on the clients list, the planner cards
 * and the workspace header since the beginning, and nothing could ever
 * write it — so every client was permanently ACTIVE and a churned one
 * stayed in everyone's sidebar forever.
 */
export async function setClientStatus(input: z.infer<typeof setStatusSchema>) {
  const admin = await requireRole("ADMIN", "MANAGER");
  const { clientId, status } = setStatusSchema.parse(input);

  const client = await prisma.client.update({
    where: { id: clientId },
    data: { status },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "CLIENT_STATUS_CHANGED",
      entityType: "Client",
      entityId: clientId,
      metadata: { status },
    },
  });

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}/settings`);
  return client;
}

const deleteClientSchema = z.object({
  clientId: z.string().cuid(),
  /** Typed back by the person deleting — a client workspace takes every
   * post, asset, board and comms entry with it, and there is no undo. */
  confirmName: z.string().min(1),
});

export async function deleteClient(input: z.infer<typeof deleteClientSchema>) {
  const admin = await requireRole("ADMIN");
  const { clientId, confirmName } = deleteClientSchema.parse(input);

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, _count: { select: { posts: true, mediaAssets: true } } },
  });
  if (!client) throw new Error("That client no longer exists.");

  if (confirmName.trim() !== client.name) {
    throw new Error(`Type the client's name exactly ("${client.name}") to confirm.`);
  }

  // Written before the delete, because afterwards there is no row to
  // reference and this is the only record that it ever existed.
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "CLIENT_DELETED",
      entityType: "Client",
      entityId: clientId,
      metadata: { name: client.name, posts: client._count.posts, assets: client._count.mediaAssets },
    },
  });

  await prisma.client.delete({ where: { id: clientId } });

  revalidatePath("/clients");
}
