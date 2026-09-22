"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { CalendarDays, Columns3 } from "lucide-react";
import { cn } from "cn";
import type { listPostsForClient } from "@/lib/actions/posts";
import { NewCampaignDialog } from "./new-campaign-dialog";

type Post = Awaited<ReturnType<typeof listPostsForClient>>[number];

/**
 * The two views are the heaviest client code in the app — FullCalendar
 * for one, dnd-kit for the other — and only ever one is on screen.
 * Importing both statically meant every visit to the plan downloaded and
 * parsed both, so the calendar paid for the board's drag-and-drop and
 * vice versa. Loading them on demand means you pay for the view you're
 * actually looking at.
 *
 * ssr: false because neither renders anything meaningful on the server:
 * FullCalendar needs layout measurement and dnd-kit needs pointer
 * events, so server-rendering them is work thrown away on hydration.
 */
const Skeleton = () => (
  <div className="h-[520px] animate-pulse rounded-2xl border border-border bg-[var(--fill)]" />
);

const PlanCalendar = dynamic(
  () => import("./plan-calendar").then((m) => m.PlanCalendar),
  { ssr: false, loading: Skeleton },
);

const PlanBoard = dynamic(
  () => import("./plan-board").then((m) => m.PlanBoard),
  { ssr: false, loading: Skeleton },
);

export function PlanView({ clientId, posts }: { clientId: string; posts: Post[] }) {
  const [view, setView] = useState<"calendar" | "board">("calendar");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="om-pill inline-flex h-auto gap-0.5 bg-[var(--fill)] p-[2px]">
        <button
          onClick={() => setView("calendar")}
          className={cn(
            "flex h-6 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium",
            view === "calendar" ? "bg-card text-foreground shadow-[0_1px_2px_rgba(21,22,23,0.06)]" : "text-[var(--ink3)]",
          )}
        >
          <CalendarDays className="size-3.5" /> Calendar
        </button>
        <button
          onClick={() => setView("board")}
          onPointerEnter={() => void import("./plan-board")}
          className={cn(
            "flex h-6 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium",
            view === "board" ? "bg-card text-foreground shadow-[0_1px_2px_rgba(21,22,23,0.06)]" : "text-[var(--ink3)]",
          )}
        >
            <Columns3 className="size-3.5" /> Board
          </button>
        </div>
        <NewCampaignDialog clientId={clientId} />
      </div>
      {view === "calendar" ? <PlanCalendar clientId={clientId} posts={posts} /> : <PlanBoard posts={posts} />}
    </div>
  );
}
