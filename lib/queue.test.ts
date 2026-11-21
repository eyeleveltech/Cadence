import { describe, it, expect, vi } from "vitest";
import { cadenceQueue, scheduleRepeatingJobs } from "./queue";

describe("Queue Job Schedulers (lib/queue.ts)", () => {
  it("registers repeating job schedulers including 6-hour sync-analytics", async () => {
    const upsertSpy = vi
      .spyOn(cadenceQueue, "upsertJobScheduler")
      // @ts-expect-error mock resolution
      .mockResolvedValue({});

    await scheduleRepeatingJobs();

    expect(upsertSpy).toHaveBeenCalledTimes(4);

    const calls = upsertSpy.mock.calls;
    const names = calls.map((c) => c[0]);

    expect(names).toContain("check-scheduled-posts");
    expect(names).toContain("check-review-deadlines");
    expect(names).toContain("check-account-health");
    expect(names).toContain("sync-analytics");

    const analyticsCall = calls.find((c) => c[0] === "sync-analytics");
    expect(analyticsCall).toBeDefined();
    // 6 hours = 6 * 60 * 60_000 = 21_600_000 ms
    expect(analyticsCall?.[1]).toEqual({ every: 21_600_000 });
  });
});

