"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, DateSelectArg, EventDropArg, EventContentArg, DayCellContentArg } from "@fullcalendar/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createPost, updatePostSchedule } from "@/lib/actions/posts";
import type { listPostsForClient } from "@/lib/actions/posts";
import type { PostStatus } from "@prisma/client";
import { POST_STATUS_LABELS } from "@/lib/roles";
import { STAGE_COLOR, StatusRing } from "@/components/status-ring";
import { ScheduleDialog, defaultSlotFor } from "./schedule-dialog";
import { toast } from "sonner";
import { cn } from "cn";

type Post = Awaited<ReturnType<typeof listPostsForClient>>[number];
type ViewName = "dayGridMonth" | "dayGridWeek";

// Soft/pastel readout of the same four phase hues the ring uses — a
// solid chip per event would be too loud packed into a month grid.
const PHASE_SOFT: Record<string, { bg: string; text: string }> = {
  "#2A4BD7": { bg: "var(--accent-soft)", text: "var(--primary)" },
  "#B0620F": { bg: "var(--status-warn-bg)", text: "var(--status-warn)" },
  "#1B7F4B": { bg: "var(--status-good-bg)", text: "var(--status-good)" },
  "#BF2E2E": { bg: "var(--status-bad-bg)", text: "var(--status-bad)" },
};

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function PlanCalendar({ clientId, posts }: { clientId: string; posts: Post[] }) {
  const router = useRouter();
  const calendarRef = useRef<FullCalendar>(null);
  const [title, setTitle] = useState("");
  const [view, setView] = useState<ViewName>("dayGridMonth");
  const [newPostDate, setNewPostDate] = useState<Date | null>(null);
  const [rescheduling, setRescheduling] = useState<Post | null>(null);
  const [busy, setBusy] = useState(false);

  const scheduled = posts.filter((p) => p.scheduledAt);
  const unscheduled = posts.filter((p) => !p.scheduledAt);

  const events = scheduled.map((post) => ({
    id: post.id,
    title: post.title,
    start: post.scheduledAt!,
    // Not allDay: the whole point is that a post goes out at a time.
    allDay: false,
    extendedProps: { status: post.status },
  }));

  function go(direction: "prev" | "next" | "today") {
    calendarRef.current?.getApi()[direction]();
  }

  function switchView(next: ViewName) {
    calendarRef.current?.getApi().changeView(next);
    setView(next);
  }

  function handleEventClick(arg: EventClickArg) {
    router.push(`/posts/${arg.event.id}`);
  }

  async function handleEventDrop(arg: EventDropArg) {
    try {
      await updatePostSchedule(arg.event.id, arg.event.start!);
      toast.success("Rescheduled");
      // The board view and the unscheduled list read the same server
      // data; without this they keep showing the old slot.
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't reschedule — reverting");
      arg.revert();
    }
  }

  function handleDateSelect(arg: DateSelectArg) {
    setNewPostDate(defaultSlotFor(arg.start));
  }

  async function handleCreate({ when, title: postTitle }: { when: Date; title: string }) {
    setBusy(true);
    try {
      const post = await createPost({
        clientId,
        title: postTitle,
        scheduledAt: when,
        platforms: [],
      });
      toast.success("Idea added to the calendar");
      setNewPostDate(null);
      router.push(`/posts/${post.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the post");
    } finally {
      setBusy(false);
    }
  }

  async function handleReschedule({ when }: { when: Date }) {
    if (!rescheduling) return;
    setBusy(true);
    try {
      await updatePostSchedule(rescheduling.id, when);
      toast.success("Scheduled");
      setRescheduling(null);
      router.refresh();
    } catch (err) {
      // This used to have no catch at all, so a refusal surfaced as an
      // unhandled rejection while the UI still claimed success.
      toast.error(err instanceof Error ? err.message : "Couldn't schedule that post");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => go("prev")}
              className="flex size-8 items-center justify-center rounded-lg border border-border bg-card text-[var(--ink2)] hover:bg-muted"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={() => go("next")}
              className="flex size-8 items-center justify-center rounded-lg border border-border bg-card text-[var(--ink2)] hover:bg-muted"
            >
              <ChevronRight className="size-4" />
            </button>
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          </div>
          <div className="inline-flex rounded-lg bg-[var(--fill)] p-[3px]">
            {(["dayGridMonth", "dayGridWeek"] as const).map((v) => (
              <button
                key={v}
                onClick={() => switchView(v)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                  view === v ? "bg-foreground text-background" : "text-[var(--ink3)]",
                )}
              >
                {v === "dayGridMonth" ? "Month" : "Week"}
              </button>
            ))}
          </div>
        </div>

        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          firstDay={1}
          headerToolbar={false}
          datesSet={(arg) => setTitle(arg.view.title)}
          events={events}
          editable
          selectable
          select={handleDateSelect}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          height="auto"
          dayCellContent={(arg: DayCellContentArg) => {
            const today = isSameDay(arg.date, new Date());
            return (
              <div className="p-1.5">
                <span
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-full text-sm",
                    today ? "bg-[var(--status-warn)] font-semibold text-white" : "text-[var(--ink2)]",
                  )}
                >
                  {arg.date.getDate()}
                </span>
              </div>
            );
          }}
          eventContent={(arg: EventContentArg) => {
            const status = arg.event.extendedProps.status as PostStatus;
            // Falls back rather than throwing: a new status hue would
            // otherwise take the whole month grid down with it.
            const soft = PHASE_SOFT[STAGE_COLOR[status]] ?? {
              bg: "var(--fill)",
              text: "var(--ink2)",
            };
            return (
              <div
                className="mx-1 truncate rounded-md px-2 py-1 text-xs font-medium"
                style={{ background: soft.bg, color: soft.text }}
              >
                {arg.timeText && <span className="om-mono mr-1 opacity-70">{arg.timeText}</span>}
                {arg.event.title}
              </div>
            );
          }}
        />
        <p className="mt-3 text-xs text-[var(--ink3)]">
          Drag a post to another date to reschedule it, or click an empty day to add an idea.
        </p>
      </div>

      <div className="space-y-3">
        <p className="om-eyebrow">Unscheduled ideas</p>
        <div className="space-y-2">
          {unscheduled.length === 0 && (
            <p className="text-sm text-[var(--ink3)]">Select a date on the calendar to add one.</p>
          )}
          {unscheduled.map((post) => (
            <div
              key={post.id}
              className="rounded-xl border p-3 text-sm"
              style={{ background: "var(--status-warn-bg)", borderColor: "color-mix(in srgb, var(--status-warn) 30%, transparent)" }}
            >
              <button
                onClick={() => router.push(`/posts/${post.id}`)}
                className="block w-full text-left font-medium hover:underline"
              >
                {post.title}
              </button>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--ink2)]">
                  <StatusRing status={post.status} size={13} />
                  {POST_STATUS_LABELS[post.status]}
                </span>
                <button
                  onClick={() => setRescheduling(post)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Schedule →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ScheduleDialog
        open={!!newPostDate}
        onOpenChange={(open) => !open && setNewPostDate(null)}
        title={`New idea — ${newPostDate?.toLocaleDateString(undefined, { month: "long", day: "numeric" }) ?? ""}`}
        initialDate={newPostDate}
        confirmLabel="Add to calendar"
        busy={busy}
        withTitle
        onConfirm={handleCreate}
      />

      <ScheduleDialog
        open={!!rescheduling}
        onOpenChange={(open) => !open && setRescheduling(null)}
        title={`Schedule "${rescheduling?.title ?? ""}"`}
        initialDate={rescheduling?.scheduledAt ?? null}
        confirmLabel="Schedule"
        busy={busy}
        onConfirm={handleReschedule}
      />

    </div>
  );
}
