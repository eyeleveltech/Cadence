"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

/** What a client reviewer sees: only posts explicitly sent to them for
 * review, for only the client(s) they're a member of — never drafts,
 * never the internal pipeline, never another client's content, and never
 * the internal half of the comment thread. */
export async function getReviewQueue() {
  const user = await requireUser();

  const memberships = await prisma.clientMember.findMany({
    where: { userId: user.id },
    select: { clientId: true, client: { select: { name: true } } },
  });
  const clientIds = memberships.map((m) => m.clientId);

  if (clientIds.length === 0) {
    return { user, clients: [], posts: [] };
  }

  const posts = await prisma.post.findMany({
    where: { clientId: { in: clientIds }, status: { in: ["CLIENT_REVIEW", "APPROVED", "REVISION"] } },
    include: {
      client: { select: { name: true } },
      assets: { include: { mediaAsset: { include: { variants: true } } }, orderBy: { sortOrder: "asc" } },
      comments: {
        // The whole thread lives on one post, so the filter is what keeps
        // "the copy on this is weak, redo it" from reaching the client.
        where: { visibility: "CLIENT" },
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { scheduledAt: "asc" },
  });

  return { user, clients: memberships.map((m) => m.client), posts };
}
