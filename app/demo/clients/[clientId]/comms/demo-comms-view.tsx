"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { COMM_TYPE_LABELS } from "@/lib/roles";
import type { DemoComm } from "@/lib/demo/data";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export function DemoCommsView({ entries }: { entries: DemoComm[] }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Communication Log</h2>
          <p className="text-sm text-muted-foreground">
            Every call, message and meeting — so context lives with the client, not one person&apos;s phone.
          </p>
        </div>
        <Button size="sm" onClick={() => toast("This is a demo — entries aren't saved.")}>
          <Plus className="size-4" /> Log Entry
        </Button>
      </div>

      <div className="space-y-3">
        {entries.map((entry) => (
          <Card key={entry.id}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <span className="om-pill">{COMM_TYPE_LABELS[entry.type]}</span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(entry.occurredAt), "d MMM yyyy, h:mm a")} · {entry.loggedBy}
                </span>
              </div>
              <p className="mt-2 text-sm">{entry.summary}</p>
              {entry.actionItems.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {entry.actionItems.map((item, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-sm text-muted-foreground">
                      <span>→</span> {item}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
