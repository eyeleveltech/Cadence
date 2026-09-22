// No "server-only" guard here — this module is imported by both the
// Next.js app (to enqueue jobs) and the standalone worker process,
// which runs outside Next's bundler and can't resolve that package.
import { Queue } from "bullmq";
import IORedis from "ioredis";

/**
 * One Redis connection, one queue, shared by the Next.js app (to enqueue
 * on demand — e.g. "publish now") and the worker process (to consume).
 * maxRetriesPerRequest: null is BullMQ's own requirement for the
 * connection it's handed, not optional tuning.
 */
export const redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const cadenceQueue = new Queue("cadence", { connection: redis });

export type CadenceJobName = "publish-post" | "check-scheduled-posts" | "check-review-deadlines" | "check-account-health";

/** Repeatable schedulers — idempotent, call once on worker boot. */
export async function scheduleRepeatingJobs() {
  await cadenceQueue.upsertJobScheduler(
    "check-scheduled-posts", { every: 60_000 },
    { name: "check-scheduled-posts" satisfies CadenceJobName },
  );
  await cadenceQueue.upsertJobScheduler(
    "check-review-deadlines", { every: 30 * 60_000 },
    { name: "check-review-deadlines" satisfies CadenceJobName },
  );
  await cadenceQueue.upsertJobScheduler(
    "check-account-health", { every: 30 * 60_000 },
    { name: "check-account-health" satisfies CadenceJobName },
  );
}
