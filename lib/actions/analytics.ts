"use server";

import { z } from "zod";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireClientWorkspaceAccess } from "@/lib/session";
import type { AnalyticsSnapshot, Platform } from "@prisma/client";

const metric = z.coerce.number().int().min(0).optional();

const logAnalyticsSchema = z.object({
  postId: z.string().cuid(),
  platform: z.enum(["INSTAGRAM", "FACEBOOK", "LINKEDIN", "YOUTUBE"]),
  reach: metric,
  impressions: metric,
  likes: metric,
  comments: metric,
  shares: metric,
  saves: metric,
});

/** Records a manual metrics reading for one post/platform — the numbers
 * a team member reads off the platform's own insights and types in.
 * Every save is a new snapshot (not an upsert) so the trend over time is
 * never lost; the client dashboard and post panel always read the latest
 * one per post/platform. Once real OAuth is live this is the same table
 * a scheduled sync job would write into instead. */
export async function logPostAnalytics(input: z.infer<typeof logAnalyticsSchema>) {
  const data = logAnalyticsSchema.parse(input);
  const post = await prisma.post.findUnique({ where: { id: data.postId }, select: { clientId: true } });
  if (!post) notFound();
  await requireClientWorkspaceAccess(post.clientId);

  const engagements = (data.likes ?? 0) + (data.comments ?? 0) + (data.shares ?? 0) + (data.saves ?? 0);

  const snapshot = await prisma.analyticsSnapshot.create({
    data: { ...data, engagements },
  });

  revalidatePath(`/posts/${data.postId}`);
  revalidatePath(`/clients/${post.clientId}/insights`);
  return snapshot;
}

function latestPerPlatform(snapshots: AnalyticsSnapshot[]) {
  const latest = new Map<Platform, AnalyticsSnapshot>();
  for (const s of snapshots) {
    const existing = latest.get(s.platform);
    if (!existing || s.pulledAt > existing.pulledAt) latest.set(s.platform, s);
  }
  return latest;
}

/** Aggregates recorded metrics across every published post for a client —
 * totals, a per-platform breakdown and a top-posts ranking. Posts with no
 * snapshot logged yet simply don't contribute; nothing here is estimated. */
export async function getClientAnalyticsOverview(clientId: string) {
  await requireClientWorkspaceAccess(clientId);

  const posts = await prisma.post.findMany({
    where: { clientId, status: "PUBLISHED" },
    include: { analyticsSnapshots: true },
    orderBy: { scheduledAt: "desc" },
  });

  type PostWithMetrics = {
    id: string;
    title: string;
    scheduledAt: Date | null;
    platform: Platform;
    reach: number;
    engagements: number;
  };

  const postRows: PostWithMetrics[] = [];
  const platformTotals = new Map<Platform, { reach: number; engagements: number; posts: number }>();
  let totalReach = 0;
  let totalEngagements = 0;

  for (const post of posts) {
    const latest = latestPerPlatform(post.analyticsSnapshots);
    for (const [platform, snap] of latest) {
      const reach = snap.reach ?? 0;
      const engagements = snap.engagements ?? 0;
      postRows.push({ id: post.id, title: post.title, scheduledAt: post.scheduledAt, platform, reach, engagements });

      totalReach += reach;
      totalEngagements += engagements;

      const bucket = platformTotals.get(platform) ?? { reach: 0, engagements: 0, posts: 0 };
      bucket.reach += reach;
      bucket.engagements += engagements;
      bucket.posts += 1;
      platformTotals.set(platform, bucket);
    }
  }

  const topPosts = [...postRows].sort((a, b) => b.engagements - a.engagements).slice(0, 8);
  const engagementRate = totalReach > 0 ? (totalEngagements / totalReach) * 100 : null;

  return {
    hasData: postRows.length > 0,
    totalReach,
    totalEngagements,
    engagementRate,
    postsWithData: postRows.length,
    platformBreakdown: [...platformTotals.entries()].map(([platform, v]) => ({ platform, ...v })),
    topPosts,
  };
}
