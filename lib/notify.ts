// Shared with the standalone worker process — no "server-only" guard.
import { prisma } from "@/lib/prisma";
import type { NotificationType } from "@prisma/client";

/**
 * Internal building block, not a server action — other action modules
 * call this directly from server-side mutations (assignment, comments,
 * status changes). Never exported through a "use server" boundary, so
 * a client can't call it directly to spam notifications at other users.
 */
export async function createNotification(input: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
}) {
  return prisma.notification.create({ data: input });
}

export async function notifyMany(
  userIds: (string | null | undefined)[],
  input: { type: NotificationType; title: string; body: string; link?: string },
) {
  const unique = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return;
  await prisma.notification.createMany({
    data: unique.map((userId) => ({ userId, ...input })),
  });
}
