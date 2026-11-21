import "dotenv/config";

const cronSecret = process.env.CRON_SECRET || "";
const port = process.env.PORT || "3000";
const targetUrl = `http://localhost:${port}/api/cron/publish${cronSecret ? `?secret=${cronSecret}` : ""}`;

console.log(`[Cadence Dev Worker] Polling ${targetUrl} every 30 seconds...`);

async function poll() {
  try {
    const headers: Record<string, string> = {};
    if (cronSecret) {
      headers["Authorization"] = `Bearer ${cronSecret}`;
    }
    const res = await fetch(targetUrl, { headers });
    if (res.ok) {
      const data = (await res.json()) as { processed: number; succeeded: number; failed: number; timestamp: string };
      if (data.processed > 0) {
        console.log(
          `[Cadence Dev Worker] Sweep completed at ${data.timestamp}: processed ${data.processed} job(s) (${data.succeeded} ok, ${data.failed} failed)`
        );
      }
    } else {
      console.warn(`[Cadence Dev Worker] Sweep returned HTTP ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.warn(`[Cadence Dev Worker] Sweep network error:`, err instanceof Error ? err.message : err);
  }
}

// Initial sweep run then periodic 30-second interval
poll();
setInterval(poll, 30_000);
