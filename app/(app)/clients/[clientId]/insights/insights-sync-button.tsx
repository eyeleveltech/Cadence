"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { syncClientAnalyticsNow } from "@/lib/actions/analytics";

export function InsightsSyncButton({ clientId }: { clientId: string }) {
  const [syncing, setSyncing] = useState(false);
  const router = useRouter();

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await syncClientAnalyticsNow(clientId);
      toast.success(
        res.syncedCount > 0
          ? `Synced analytics for ${res.syncedCount} post(s)!`
          : "No new metrics to sync.",
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to sync analytics");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSync}
      disabled={syncing}
      className="gap-2 text-xs font-medium"
    >
      <RefreshCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
      {syncing ? "Syncing..." : "Sync Analytics"}
    </Button>
  );
}

