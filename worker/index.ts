import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { prisma } from "../lib/prisma";
import { redis, cadenceQueue, scheduleRepeatingJobs, type CadenceJobName } from "../lib/queue";
import { getSocialAdapter } from "../lib/social/adapter";
import { resolvePlatformCaption } from "../lib/social/caption";
import { notifyMany } from "../lib/notify";
import { assessConnection, STATUS_LABEL } from "../lib/social/health";
import { decryptToken } from "../lib/crypto";
import { isFfmpegAvailable, processVideoAsset } from "../lib/media-pipeline";
import { storage } from "../lib/storage";
import { fetchPostMetrics } from "../lib/social/analytics";
import { getValidAccessToken } from "../lib/social/tokens";
import type { PostStatus, SocialAccount } from "@prisma/client";

const REVIEW_DEADLINE_SOON_HOURS = 24;
const REVIEW_OVERDUE_HOURS = 48;
const REFRESH_WITHIN_DAYS = 14; // renew well before the 60-day window closes
const DEDUPE_WINDOW_HOURS = 20; // shorter than the 30-min poll's next-threshold gap, long enough to not spam

async function alreadyNotifiedRecently(link: string, type: string) {
  const since = new Date(Date.now() - DEDUPE_WINDOW_HOURS * 60 * 60 * 1000);
  const existing = await prisma.notification.findFirst({
    where: { link, type: type as never, createdAt: { gte: since } },
  });
  return Boolean(existing);
}

/** Finds posts crossed into SCHEDULED and due, and hands each to its own
 * publish-post job — one job per post keeps a single slow platform call
 * from blocking the rest of the batch. */
async function checkScheduledPosts() {
  const due = await prisma.post.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
    select: { id: true },
  });
  for (const post of due) {
    await cadenceQueue.add(
      "publish-post" satisfies CadenceJobName,
      { postId: post.id },
      {
        // The post's own id as the job id. This sweep runs every 60
        // seconds and a Reel upload takes minutes, so without it the
        // next sweep enqueues the same post again while the first
        // attempt is still in flight — and BullMQ, given no jobId,
        // mints a fresh one every time and happily runs both.
        jobId: `publish-${post.id}`,
        attempts: 3,
        // A platform 500 or a timeout is usually transient; one failed
        // attempt used to mark the post FAILED forever.
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: 50,
        removeOnFail: 200,
      },
    );
  }
}

/** The actual publish attempt — behind the adapter interface, so every
 * platform fails the same honest way until its OAuth app clears review. */
async function publishPost(postId: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { assets: { include: { mediaAsset: true } } },
  });
  if (!post || post.status !== "SCHEDULED") return; // already handled, or moved on before the job ran

  const accounts = await prisma.socialAccount.findMany({
    where: { clientId: post.clientId, platform: { in: post.platforms } },
  });

  const results: { platform: string; ok: boolean; error?: string }[] = [];

  for (const platform of post.platforms) {
    const account = accounts.find((a) => a.platform === platform);
    if (!account) {
      results.push({ platform, ok: false, error: "No connected account for this platform" });
      continue;
    }

    const idempotencyKey = `${post.id}:${platform}`;

    // The guard the schema has always promised: "platformPostId — set
    // once published; checked before any retry to prevent
    // double-posting." Nothing ever read it. If this post already went
    // out on this platform, it is never sent again, whatever the queue
    // or a retry thinks.
    const existing = await prisma.scheduledJob.findUnique({
      where: { idempotencyKey },
      select: { platformPostId: true },
    });
    if (existing?.platformPostId) {
      results.push({ platform, ok: true });
      continue;
    }

    // Claim the attempt before calling out, so a concurrent worker sees
    // PROCESSING rather than an absent row.
    await prisma.scheduledJob.upsert({
      where: { idempotencyKey },
      create: {
        postId: post.id, socialAccountId: account.id, platform, idempotencyKey,
        scheduledFor: post.scheduledAt ?? new Date(), status: "PROCESSING",
      },
      update: { status: "PROCESSING" },
    });

    try {
      const { caption: platformCaption, title: platformTitle } = resolvePlatformCaption(post.caption, platform);
      const result = await getSocialAdapter(platform).publish({
        caption: platformCaption,
        title: platformTitle || post.title,
        hashtags: post.hashtags,
        mediaUrls: post.assets.map((a) => a.mediaAsset.originalUrl),
        postAsStory: false,
        account,
        collaborators: post.collaborators,
        mediaAsset: post.assets[0]?.mediaAsset,
        firstComment: post.firstComment,
      });
      await prisma.scheduledJob.upsert({
        where: { idempotencyKey },
        create: {
          postId: post.id, socialAccountId: account.id, platform, idempotencyKey,
          scheduledFor: post.scheduledAt ?? new Date(),
          status: "DONE", platformPostId: result.externalId, errorLog: result.permalink || null, publishedAt: new Date(),
        },
        update: { status: "DONE", platformPostId: result.externalId, errorLog: result.permalink || null, publishedAt: new Date() },
      });
      results.push({ platform, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await prisma.scheduledJob.upsert({
        where: { idempotencyKey },
        create: {
          postId: post.id, socialAccountId: account.id, platform, idempotencyKey,
          scheduledFor: post.scheduledAt ?? new Date(),
          status: "FAILED", errorLog: message, attempts: 1,
        },
        update: { status: "FAILED", errorLog: message, attempts: { increment: 1 } },
      });
      results.push({ platform, ok: false, error: message });
    }
  }

  const anySucceeded = results.some((r) => r.ok);
  const newStatus: PostStatus = anySucceeded ? "PUBLISHED" : "FAILED";
  await prisma.post.update({ where: { id: post.id }, data: { status: newStatus, statusChangedAt: new Date() } });

  // Delayed Story Engine: if postAsStory is true and INSTAGRAM was published, queue delayed story job
  if (post.postAsStory && post.platforms.includes("INSTAGRAM")) {
    const igAccount = accounts.find((a) => a.platform === "INSTAGRAM");
    if (igAccount) {
      const storyKey = `${post.id}:INSTAGRAM_STORY`;
      const delayMs = Number(process.env.IG_STORY_DELAY_MS || 10 * 60 * 1000);
      try {
        const storyJob = await cadenceQueue.add(
          "publish-story" satisfies CadenceJobName,
          { postId: post.id },
          { delay: delayMs, jobId: `story-${post.id}`, removeOnComplete: 50, removeOnFail: 200 }
        );
        await prisma.scheduledJob.upsert({
          where: { idempotencyKey: storyKey },
          create: {
            postId: post.id,
            socialAccountId: igAccount.id,
            platform: "INSTAGRAM",
            idempotencyKey: storyKey,
            bullmqJobId: storyJob.id,
            status: "QUEUED",
            scheduledFor: new Date(Date.now() + delayMs),
          },
          update: {
            bullmqJobId: storyJob.id,
            status: "QUEUED",
            scheduledFor: new Date(Date.now() + delayMs),
          },
        });
      } catch (err) {
        console.warn(`[worker] failed to enqueue story for ${post.id}:`, err);
      }
    }
  }

  const summary = results.map((r) => `${r.platform}: ${r.ok ? "published" : r.error}`).join(" · ");
  await notifyMany(
    [post.createdById, post.assignedDesignerId, post.assignedWriterId],
    anySucceeded
      ? { type: "POST_PUBLISHED", title: `Published: ${post.title}`, body: summary, link: `/posts/${post.id}` }
      : { type: "POST_FAILED", title: `Failed to publish: ${post.title}`, body: summary, link: `/posts/${post.id}` },
  );
}

/** A post sitting in Internal or Client Review too long is the most
 * common way work quietly stalls — this is the reminder half of the
 * stack's "scheduled publishing, token refresh, analytics sync,
 * reminders" job list. */
async function checkReviewDeadlines() {
  const stuck = await prisma.post.findMany({
    where: { status: { in: ["INTERNAL_REVIEW", "CLIENT_REVIEW"] } },
    select: { id: true, title: true, statusChangedAt: true, createdById: true, assignedDesignerId: true, assignedWriterId: true },
  });

  const now = Date.now();
  for (const post of stuck) {
    // statusChangedAt, not updatedAt: this is "how long has it been
    // waiting on a review", not "how long since anyone edited it".
    const hoursStuck = (now - post.statusChangedAt.getTime()) / (60 * 60 * 1000);
    const link = `/posts/${post.id}`;

    if (hoursStuck >= REVIEW_OVERDUE_HOURS && !(await alreadyNotifiedRecently(link, "APPROVAL_OVERDUE"))) {
      await notifyMany([post.createdById, post.assignedDesignerId, post.assignedWriterId], {
        type: "APPROVAL_OVERDUE",
        title: `Overdue for review: ${post.title}`,
        body: `Still waiting after ${Math.floor(hoursStuck)}h.`,
        link,
      });
    } else if (hoursStuck >= REVIEW_DEADLINE_SOON_HOURS && !(await alreadyNotifiedRecently(link, "APPROVAL_DEADLINE_SOON"))) {
      await notifyMany([post.createdById, post.assignedDesignerId, post.assignedWriterId], {
        type: "APPROVAL_DEADLINE_SOON",
        title: `Waiting on review: ${post.title}`,
        body: `${Math.floor(hoursStuck)}h and counting.`,
        link,
      });
    }
  }
}

/**
 * Re-assesses every connection, writes the result, and tells someone.
 *
 * This used to only *read* rows that weren't CONNECTED — but nothing in
 * the codebase ever set a connection to anything else, so the query
 * could never match and the job was silently a no-op. It now does the
 * assessing as well, which is what makes an expiring token visible
 * before the post that needed it fails.
 */
async function checkAccountHealth() {
  const accounts = await prisma.socialAccount.findMany({
    include: { client: { select: { name: true } } },
  });

  for (const account of accounts) {
    // Renew before nagging. Instagram's direct login issues a 60-day
    // token that can be traded for a fresh one without the client seeing
    // a consent screen — so a connection that would otherwise expire
    // four times a year just keeps working.
    if (await tryRefresh(account)) continue;

    const verdict = assessConnection({
      tokenType: account.tokenType,
      tokenExpiresAt: account.tokenExpiresAt,
      // A live probe needs the platform adapters, which throw until the
      // apps clear review. Expiry alone is checkable today and is the
      // failure that actually bites: a 60-day user token dying quietly.
    });

    if (verdict.status !== account.connectionStatus || verdict.detail !== account.statusDetail) {
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          connectionStatus: verdict.status,
          statusDetail: verdict.detail,
          lastHealthCheckAt: new Date(),
        },
      });
    } else {
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: { lastHealthCheckAt: new Date() },
      });
    }

    if (verdict.status === "CONNECTED") continue;

    const link = `/clients/${account.clientId}/settings`;
    if (await alreadyNotifiedRecently(link, "ACCOUNT_NEEDS_RECONNECT")) continue;

    await notifyMany(await leadershipFor(account.clientId), {
      type: "ACCOUNT_NEEDS_RECONNECT",
      title: `${account.client.name}: ${account.platform} needs attention`,
      body: `${account.accountName} — ${STATUS_LABEL[verdict.status].toLowerCase()}. ${verdict.detail ?? ""}`.trim(),
      link,
    });
  }
}

/**
 * Who can actually fix a broken connection: every admin and manager,
 * plus anyone assigned to the client.
 *
 * The old version looked only at ClientMember rows filtered to
 * ADMIN/MANAGER — but leadership reaches every client *by role*, not by
 * membership, so an admin with no membership rows (which is the normal
 * case, and true of this app's only admin) was never told. The alert
 * went to nobody.
 */
async function leadershipFor(clientId: string): Promise<string[]> {
  const [leadership, members] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: ["ADMIN", "MANAGER"] } },
      select: { id: true },
    }),
    prisma.clientMember.findMany({
      where: { clientId, user: { role: { not: "CLIENT_REVIEWER" } } },
      select: { userId: true },
    }),
  ]);

  return [...new Set([...leadership.map((u) => u.id), ...members.map((m) => m.userId)])];
}

async function transcodeVideoJob(assetId: string) {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
    include: { variants: true },
  });
  if (!asset || asset.originalKind !== "VIDEO") return;

  if (!(await isFfmpegAvailable())) {
    console.warn(`[worker] FFmpeg not available. Leaving video asset ${assetId} READY without derived variants.`);
    await prisma.mediaAsset.update({
      where: { id: assetId },
      data: { status: "READY" },
    });
    return;
  }

  try {
    let rawBuffer: Buffer | null = null;
    if (asset.originalUrl.startsWith("http://") || asset.originalUrl.startsWith("https://")) {
      const res = await fetch(asset.originalUrl);
      if (res.ok) {
        rawBuffer = Buffer.from(await res.arrayBuffer());
      }
    } else {
      rawBuffer = await storage.read(asset.originalUrl);
    }

    if (!rawBuffer) {
      console.warn(`[worker] Could not read original media buffer for asset ${assetId}`);
      return;
    }

    const variants = await processVideoAsset(asset.clientId, asset.id, rawBuffer);
    if (variants.length > 0) {
      await prisma.mediaVariant.createMany({
        data: variants.map((v) => ({
          mediaAssetId: asset.id,
          kind: v.kind,
          url: v.url,
          width: v.width,
          height: v.height,
          fileSizeBytes: v.fileSizeBytes,
        })),
        skipDuplicates: true,
      });
    }

    await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { status: "READY" },
    });
    console.log(`[worker] Transcoded video asset ${assetId}: generated ${variants.length} variants.`);
  } catch (err) {
    console.error(`[worker] Failed to transcode video asset ${assetId}:`, err);
    await prisma.mediaAsset.update({
      where: { id: assetId },
      data: { status: "READY", processingError: err instanceof Error ? err.message : "Transcode failed" },
    });
  }
}

async function syncAnalyticsJob() {
  const publishedJobs = await prisma.scheduledJob.findMany({
    where: {
      status: "DONE",
      platformPostId: { not: null },
    },
    include: {
      socialAccount: true,
    },
    orderBy: { publishedAt: "desc" },
    take: 100,
  });

  let synced = 0;
  for (const job of publishedJobs) {
    if (!job.platformPostId || !job.socialAccount) continue;

    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(job.socialAccount);
    } catch {
      try {
        accessToken = decryptToken(job.socialAccount.accessToken);
      } catch {
        accessToken = job.socialAccount.accessToken;
      }
    }

    try {
      const metrics = await fetchPostMetrics({
        platform: job.platform,
        externalPostId: job.platformPostId,
        accessToken,
      });

      const engagements =
        metrics.engagements ??
        (metrics.likes ?? 0) +
          (metrics.comments ?? 0) +
          (metrics.shares ?? 0) +
          (metrics.saves ?? 0);

      await prisma.analyticsSnapshot.create({
        data: {
          postId: job.postId,
          platform: job.platform,
          reach: metrics.reach,
          impressions: metrics.impressions,
          likes: metrics.likes,
          comments: metrics.comments,
          shares: metrics.shares,
          saves: metrics.saves,
          engagements,
        },
      });
      synced++;
    } catch (err) {
      console.warn(`[worker] Failed to sync analytics for post ${job.postId} on ${job.platform}:`, err);
    }
  }

  console.log(`[worker] sync-analytics completed: recorded snapshots for ${synced} published post(s).`);
}

async function publishStory(postId: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { assets: { include: { mediaAsset: true } } },
  });
  if (!post || post.assets.length === 0) return;

  const account = await prisma.socialAccount.findFirst({
    where: { clientId: post.clientId, platform: "INSTAGRAM", connectionStatus: "CONNECTED" },
  });
  if (!account) return;

  const idempotencyKey = `${post.id}:INSTAGRAM_STORY`;
  const existing = await prisma.scheduledJob.findUnique({
    where: { idempotencyKey },
    select: { platformPostId: true, status: true },
  });
  if (existing?.status === "DONE" && existing.platformPostId) {
    return; // Already published
  }

  await prisma.scheduledJob.upsert({
    where: { idempotencyKey },
    create: {
      postId: post.id,
      socialAccountId: account.id,
      platform: "INSTAGRAM",
      idempotencyKey,
      scheduledFor: new Date(),
      status: "PROCESSING",
    },
    update: { status: "PROCESSING" },
  });

  try {
    const res = await getSocialAdapter("INSTAGRAM").publish({
      caption: post.caption ?? "",
      hashtags: post.hashtags,
      mediaUrls: post.assets.map((a) => a.mediaAsset.originalUrl),
      postAsStory: true,
      account,
    });

    await prisma.scheduledJob.upsert({
      where: { idempotencyKey },
      create: {
        postId: post.id,
        socialAccountId: account.id,
        platform: "INSTAGRAM",
        idempotencyKey,
        scheduledFor: new Date(),
        status: "DONE",
        platformPostId: res.externalId,
        errorLog: res.permalink || null,
        publishedAt: new Date(),
      },
      update: {
        status: "DONE",
        platformPostId: res.externalId,
        errorLog: res.permalink || null,
        publishedAt: new Date(),
      },
    });

    await notifyMany(
      [post.createdById, post.assignedDesignerId, post.assignedWriterId].filter(Boolean) as string[],
      {
        type: "POST_PUBLISHED",
        title: `Story Published: ${post.title}`,
        body: `Instagram Story has been published.`,
        link: `/posts/${post.id}`,
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Story publish failed";
    await prisma.scheduledJob.upsert({
      where: { idempotencyKey },
      create: {
        postId: post.id,
        socialAccountId: account.id,
        platform: "INSTAGRAM",
        idempotencyKey,
        scheduledFor: new Date(),
        status: "FAILED",
        errorLog: message,
        attempts: 1,
      },
      update: {
        status: "FAILED",
        errorLog: message,
        attempts: { increment: 1 },
      },
    });
  }
}

const worker = new Worker(
  "cadence",
  async (job: Job) => {
    switch (job.name as CadenceJobName) {
      case "check-scheduled-posts": return checkScheduledPosts();
      case "publish-post": return publishPost(job.data.postId);
      case "publish-story": return publishStory(job.data.postId);
      case "check-review-deadlines": return checkReviewDeadlines();
      case "check-account-health": return checkAccountHealth();
      case "transcode-video": return transcodeVideoJob(job.data.assetId);
      case "sync-analytics": return syncAnalyticsJob();
      default: console.warn(`[worker] unknown job: ${job.name}`);
    }
  },
  { connection: redis, concurrency: 5 },
);

worker.on("failed", (job, err) => {
  console.error(`[worker] ${job?.name} (${job?.id}) failed:`, err.message);
});

async function main() {
  await scheduleRepeatingJobs();
  console.log("[worker] running — publish, review-deadline and account-health checks scheduled");
}

main().catch((err) => {
  console.error("[worker] failed to start:", err);
  process.exit(1);
});

async function shutdown() {
  await worker.close();
  await redis.quit();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

/**
 * Renews a token that's heading for expiry, where the platform supports
 * it. Returns true only when a fresh token was actually stored, so the
 * caller can skip straight past the "tell someone" path.
 *
 * PAGE and SYSTEM_USER tokens don't expire and have nothing to refresh.
 */
async function tryRefresh(account: SocialAccount): Promise<boolean> {
  if (account.tokenType !== "USER" || !account.tokenExpiresAt) return false;

  const daysLeft = (account.tokenExpiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  // Already dead — refreshing won't work, and the health check should
  // surface it rather than this quietly swallowing it.
  if (daysLeft <= 0 || daysLeft > REFRESH_WITHIN_DAYS) return false;

  try {
    const renewed = await getValidAccessToken(account);
    return Boolean(renewed);
  } catch (err) {
    console.error(`[worker] token refresh failed for ${account.id}:`, err);
    return false;
  }
}
