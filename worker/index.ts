import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { prisma } from "../lib/prisma";
import { redis, cadenceQueue, scheduleRepeatingJobs, type CadenceJobName } from "../lib/queue";
import { getSocialAdapter } from "../lib/social/adapter";
import { notifyMany } from "../lib/notify";
import { assessConnection, STATUS_LABEL } from "../lib/social/health";
import { getOAuthAdapter, isPlatformSlug } from "../lib/social/oauth";
import { encryptToken, decryptToken } from "../lib/crypto";
import type { PostStatus } from "@prisma/client";

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
      const result = await getSocialAdapter(platform).publish({
        caption: post.caption ?? "",
        hashtags: post.hashtags,
        mediaUrls: post.assets.map((a) => a.mediaAsset.originalUrl),
        postAsStory: post.postAsStory,
        account,
      });
      await prisma.scheduledJob.upsert({
        where: { idempotencyKey },
        create: {
          postId: post.id, socialAccountId: account.id, platform, idempotencyKey,
          scheduledFor: post.scheduledAt ?? new Date(),
          status: "DONE", platformPostId: result.externalId, publishedAt: new Date(),
        },
        update: { status: "DONE", platformPostId: result.externalId, publishedAt: new Date() },
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

const worker = new Worker(
  "cadence",
  async (job: Job) => {
    switch (job.name as CadenceJobName) {
      case "check-scheduled-posts": return checkScheduledPosts();
      case "publish-post": return publishPost(job.data.postId);
      case "check-review-deadlines": return checkReviewDeadlines();
      case "check-account-health": return checkAccountHealth();
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
async function tryRefresh(account: {
  id: string;
  platform: string;
  tokenType: string;
  tokenExpiresAt: Date | null;
  accessToken: string;
  scopes: string[];
}): Promise<boolean> {
  if (account.tokenType !== "USER" || !account.tokenExpiresAt) return false;

  const daysLeft = (account.tokenExpiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  // Already dead — refreshing won't work, and the health check should
  // surface it rather than this quietly swallowing it.
  if (daysLeft <= 0 || daysLeft > REFRESH_WITHIN_DAYS) return false;

  // Instagram's two routes share Platform.INSTAGRAM; only the direct one
  // can refresh, and it's the only one that issues USER tokens for IG.
  const slug = account.platform === "INSTAGRAM" ? "instagram-direct" : account.platform.toLowerCase();
  if (!isPlatformSlug(slug)) return false;

  const adapter = getOAuthAdapter(slug);
  if (!adapter.refreshAccessToken || !adapter.isConfigured()) return false;

  try {
    const renewed = await adapter.refreshAccessToken(decryptToken(account.accessToken));
    if (!renewed) return false;

    await prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        accessToken: encryptToken(renewed.accessToken),
        tokenExpiresAt: renewed.expiresAt ?? null,
        connectionStatus: "CONNECTED",
        statusDetail: null,
        lastHealthCheckAt: new Date(),
      },
    });
    console.log(`[worker] refreshed ${account.platform} token for account ${account.id}`);
    return true;
  } catch (err) {
    console.error(`[worker] token refresh failed for ${account.id}:`, err);
    return false;
  }
}
