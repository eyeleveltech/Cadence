"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireClientWorkspaceAccess, requireRole } from "@/lib/session";

const createCommLogSchema = z.object({
  clientId: z.string().cuid(),
  type: z.enum(["CALL", "WHATSAPP", "EMAIL", "MEETING", "BRIEF_UPDATE"]),
  summary: z.string().min(1).max(4000),
  actionItems: z.array(z.string().min(1).max(300)).default([]),
  occurredAt: z.coerce.date(),
});

export async function createCommLog(input: z.infer<typeof createCommLogSchema>) {
  const data = createCommLogSchema.parse(input);
  const user = await requireClientWorkspaceAccess(data.clientId);

  const entry = await prisma.commLog.create({
    data: { ...data, attachmentUrls: [], loggedById: user.id },
  });

  revalidatePath(`/clients/${data.clientId}/comms`);
  return entry;
}

export async function deleteCommLog(clientId: string, entryId: string) {
  const user = await requireRole("ADMIN", "MANAGER");

  const entry = await prisma.commLog.findUniqueOrThrow({ where: { id: entryId } });
  if (entry.clientId !== clientId) throw new Error("That entry doesn't belong to this client.");

  await prisma.commLog.delete({ where: { id: entryId } });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "COMM_LOG_DELETED",
      entityType: "CommLog",
      entityId: entryId,
      metadata: { clientId },
    },
  });

  revalidatePath(`/clients/${clientId}/comms`);
}

// The client communication log is an internal record of how the account
// is being handled — notes on calls, what was promised, what to chase. It
// is not something the client's own reviewer should be reading.
export async function listCommLogs(clientId: string) {
  await requireClientWorkspaceAccess(clientId);

  return prisma.commLog.findMany({
    take: 200,
    where: { clientId },
    include: { loggedBy: { select: { name: true, role: true } } },
    orderBy: { occurredAt: "desc" },
  });
}
