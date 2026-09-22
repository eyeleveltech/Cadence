"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireClientWorkspaceAccess } from "@/lib/session";

/**
 * Campaigns group related posts — "TNPPL Season 2", "Onam Launch".
 *
 * The model, the foreign key on Post and the campaign name in the plan
 * query all shipped; nothing ever created one, so campaignId was always
 * null and the whole feature was dead weight. This is the missing half.
 */

export async function listCampaigns(clientId: string) {
  await requireClientWorkspaceAccess(clientId);

  return prisma.campaign.findMany({
    where: { clientId },
    include: { _count: { select: { posts: true } } },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
}

const createCampaignSchema = z.object({
  clientId: z.string().cuid(),
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export async function createCampaign(input: z.infer<typeof createCampaignSchema>) {
  const data = createCampaignSchema.parse(input);
  await requireClientWorkspaceAccess(data.clientId);

  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    throw new Error("The campaign can't end before it starts.");
  }

  const campaign = await prisma.campaign.create({ data });

  revalidatePath(`/clients/${data.clientId}/plan`);
  return campaign;
}

const assignSchema = z.object({
  postId: z.string().cuid(),
  campaignId: z.string().cuid().nullable(),
});

/** Files a post under a campaign, or takes it back out. */
export async function setPostCampaign(input: z.infer<typeof assignSchema>) {
  const data = assignSchema.parse(input);

  const post = await prisma.post.findUnique({
    where: { id: data.postId },
    select: { id: true, clientId: true },
  });
  if (!post) throw new Error("That post no longer exists.");

  await requireClientWorkspaceAccess(post.clientId);

  // A campaign from another client would file this post under someone
  // else's plan — the same check createPost makes.
  if (data.campaignId) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: data.campaignId, clientId: post.clientId },
      select: { id: true },
    });
    if (!campaign) throw new Error("That campaign doesn't belong to this client.");
  }

  await prisma.post.update({
    where: { id: post.id },
    data: { campaignId: data.campaignId },
  });

  revalidatePath(`/posts/${post.id}`);
  revalidatePath(`/clients/${post.clientId}/plan`);
}
