"use server";

import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";

/** The individual planner — every client a person touches, in one view,
 * plus everything currently sitting in their queue across all of them. */
export async function getMyPlannerData() {
  const user = await requireUser();
  // The planner is the internal view of every client a person touches.
  // A client reviewer belongs in /review; the layout redirects them, but
  // the action is reachable on its own.
  if (user.role === "CLIENT_REVIEWER") notFound();

  const isLeadership = user.role === "ADMIN" || user.role === "MANAGER";

  const clientWhere = isLeadership
    ? {}
    : { members: { some: { userId: user.id } } };

  const [clients, myPosts, recentComms] = await Promise.all([
    prisma.client.findMany({
      where: clientWhere,
      orderBy: { name: "asc" },
      include: {
        posts: {
          where: { scheduledAt: { gte: new Date() } },
          orderBy: { scheduledAt: "asc" },
          take: 1,
        },
        _count: { select: { posts: true } },
      },
    }),
    prisma.post.findMany({
      where: {
        status: { notIn: ["PUBLISHED", "FAILED"] },
        OR: [
          { assignedDesignerId: user.id },
          { assignedWriterId: user.id },
        ],
      },
      include: { client: { select: { name: true, slug: true } } },
      orderBy: { scheduledAt: "asc" },
      take: 20,
    }),
    prisma.commLog.findMany({
      where: isLeadership ? {} : { client: { members: { some: { userId: user.id } } } },
      include: { client: { select: { name: true, slug: true } }, loggedBy: { select: { name: true, role: true } } },
      orderBy: { occurredAt: "desc" },
      take: 8,
    }),
  ]);

  return { user, clients, myPosts, recentComms };
}
