"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ImageOff, Plus } from "lucide-react";
import type { DemoMoodBoard } from "@/lib/demo/data";
import { toast } from "sonner";

export function DemoBoardsView({ boards }: { boards: DemoMoodBoard[] }) {
  if (boards.length === 0) {
    return <p className="py-16 text-center text-sm text-muted-foreground">No mood boards yet for this client.</p>;
  }

  return (
    <Tabs defaultValue={boards[0].id} className="space-y-4">
      <div className="flex items-center justify-between">
        <TabsList>
          {boards.map((b) => <TabsTrigger key={b.id} value={b.id}>{b.name}</TabsTrigger>)}
        </TabsList>
        <Button size="sm" variant="outline" onClick={() => toast("This is a demo — boards aren't saved.")}>
          <Plus className="size-4" /> New Board
        </Button>
      </div>
      {boards.map((board) => (
        <TabsContent key={board.id} value={board.id} className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => toast("This is a demo — references aren't saved.")}>
              <Plus className="size-4" /> Add Reference
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {board.items.map((item) => (
              <div key={item.id} className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="flex aspect-square items-center justify-center bg-[var(--fill)]">
                  <ImageOff className="size-6 text-[var(--ink4)]" />
                </div>
                <div className="space-y-1.5 p-2.5">
                  <p className="truncate text-xs font-medium">{item.title}</p>
                  <div className="flex flex-wrap gap-1">
                    {item.tags.map((tag) => <span key={tag} className="om-pill">{tag}</span>)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
