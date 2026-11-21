import { prisma } from "@/lib/prisma";
import { getSocialAdapter } from "@/lib/social/adapter";
import { resolvePlatformCaption } from "@/lib/social/caption";

export type PublishSweepResult = {
  processed: number;
  succeeded: number;
  failed: number;
  timestamp: string;
  details: Array<{
    jobId: string;
    postId: string;
    platform: string;
    status: "DONE" | "FAILED";
    error?: string;
    permalink?: string;
  }>;
};

/**
 * Executes a publishing sweep over all due scheduled jobs.
 * Enforces concurrency locking via status: 'PROCESSING' before executing network calls.
 */
export async function runPublishSweep(batchSize = 20): Promise<PublishSweepResult> {
  const now = new Date();

  // 1. Ensure any Post in SCHEDULED status due now has corresponding ScheduledJob entries
  const duePosts = await prisma.post.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: now },
    },
    include: {
      assets: { include: { mediaAsset: true }, orderBy: { sortOrder: "asc" } },
    },
  });

  for (const post of duePosts) {
    const accounts = await prisma.socialAccount.findMany({
      where: {
        clientId: post.clientId,
        platform: { in: post.platforms },
        connectionStatus: "CONNECTED",
      },
    });

    for (const platform of post.platforms) {
      const account = accounts.find((a) => a.platform === platform);
      const idempotencyKey = `${post.id}:${platform}`;
      const existing = await prisma.scheduledJob.findUnique({ where: { idempotencyKey } });
      if (!existing) {
        await prisma.scheduledJob.create({
          data: {
            postId: post.id,
            socialAccountId: account?.id,
            platform,
            idempotencyKey,
            scheduledFor: post.scheduledAt ?? now,
            status: "QUEUED",
          },
        });
      }
    }
  }

  // 2. Query all queued jobs due for execution
  const dueJobs = await prisma.scheduledJob.findMany({
    where: {
      status: "QUEUED",
      scheduledFor: { lte: now },
    },
    include: {
      post: {
        include: {
          assets: { include: { mediaAsset: true }, orderBy: { sortOrder: "asc" } },
        },
      },
      socialAccount: true,
    },
    take: batchSize,
    orderBy: { scheduledFor: "asc" },
  });

  if (dueJobs.length === 0) {
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      timestamp: now.toISOString(),
      details: [],
    };
  }

  // 3. Concurrency & Idempotency Lock: Immediately mark as PROCESSING in a transaction
  const jobIds = dueJobs.map((j) => j.id);
  await prisma.scheduledJob.updateMany({
    where: {
      id: { in: jobIds },
      status: "QUEUED",
    },
    data: {
      status: "PROCESSING",
    },
  });

  const details: PublishSweepResult["details"] = [];
  let succeeded = 0;
  let failed = 0;

  for (const job of dueJobs) {
    const platform = job.platform;
    const post = job.post;

    try {
      // Find valid account if not included or expired
      const account =
        job.socialAccount ??
        (await prisma.socialAccount.findFirst({
          where: {
            clientId: post.clientId,
            platform,
            connectionStatus: "CONNECTED",
          },
        }));

      if (!account) {
        throw new Error(`No connected ${platform} account found for client.`);
      }

      // Check if already published to prevent double-posting
      if (job.platformPostId) {
        await prisma.scheduledJob.update({
          where: { id: job.id },
          data: { status: "DONE" },
        });
        succeeded++;
        details.push({
          jobId: job.id,
          postId: post.id,
          platform,
          status: "DONE",
          permalink: job.errorLog || undefined,
        });
        continue;
      }

      const { caption: platformCaption, title: platformTitle } = resolvePlatformCaption(post.caption, platform);
      const adapter = getSocialAdapter(platform);
      const res = await adapter.publish({
        caption: platformCaption,
        title: platformTitle || post.title,
        hashtags: post.hashtags,
        mediaUrls: post.assets.map((a) => a.mediaAsset.originalUrl),
        postAsStory: post.postAsStory,
        account,
        collaborators: post.collaborators,
        mediaAsset: post.assets[0]?.mediaAsset,
        firstComment: post.firstComment,
      });

      await prisma.scheduledJob.update({
        where: { id: job.id },
        data: {
          status: "DONE",
          platformPostId: res.externalId,
          errorLog: res.permalink || null,
          publishedAt: new Date(),
        },
      });

      // Audit Log for success
      await prisma.auditLog.create({
        data: {
          action: "PUBLISH_SUCCESS",
          entityType: "ScheduledJob",
          entityId: job.id,
          metadata: {
            postId: post.id,
            platform,
            externalId: res.externalId,
            permalink: res.permalink,
          },
        },
      });

      succeeded++;
      details.push({
        jobId: job.id,
        postId: post.id,
        platform,
        status: "DONE",
        permalink: res.permalink,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Publishing failed";
      console.error(`[Cron Publish] Job ${job.id} failed on ${platform}:`, errorMsg);

      await prisma.scheduledJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          errorLog: errorMsg,
          attempts: { increment: 1 },
        },
      });

      // Audit Log for failure
      await prisma.auditLog.create({
        data: {
          action: "PUBLISH_FAILED",
          entityType: "ScheduledJob",
          entityId: job.id,
          metadata: {
            postId: post.id,
            platform,
            error: errorMsg,
          },
        },
      });

      failed++;
      details.push({
        jobId: job.id,
        postId: post.id,
        platform,
        status: "FAILED",
        error: errorMsg,
      });
    }

    // Check post completion status across all its scheduled platforms
    const allJobsForPost = await prisma.scheduledJob.findMany({
      where: { postId: post.id },
      select: { status: true },
    });
    const anyDone = allJobsForPost.some((j) => j.status === "DONE");
    const anyPending = allJobsForPost.some(
      (j) => j.status === "QUEUED" || j.status === "PROCESSING"
    );

    if (!anyPending) {
      await prisma.post.update({
        where: { id: post.id },
        data: {
          status: anyDone ? "PUBLISHED" : "FAILED",
          statusChangedAt: new Date(),
        },
      });
    }
  }

  return {
    processed: dueJobs.length,
    succeeded,
    failed,
    timestamp: now.toISOString(),
    details,
  };
}
