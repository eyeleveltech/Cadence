"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CalendarDays, Columns3 } from "lucide-react";
import { cn } from "cn";
import type { PostStatus } from "@prisma/client";
import type { DemoPost } from "@/lib/demo/data";
import { POST_STATUS_LABELS, POST_STATUS_ORDER } from "@/lib/roles";
import { StatusRing } from "@/components/status-ring";
import { format } from "date-fns";
import { toast } from "sonner";

export function DemoPlanView({ posts: initialPosts }: { posts: DemoPost[] }) {
  const [view, setView] = useState<"calendar" | "board">("board");
  const [posts, setPosts] = useState(initialPosts);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const postId = active.id as string;
    const nextStatus = over.id as PostStatus;
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: nextStatus } : p)));
    toast("Moved — this is a demo, nothing is saved.");
  }

  const scheduled = posts.filter((p) => p.scheduledAt).sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
  const unscheduled = posts.filter((p) => !p.scheduledAt);

  return (
    <div className="space-y-4">
      <div className="om-pill inline-flex h-auto gap-0.5 bg-[var(--fill)] p-[2px]">
        <button
          onClick={() => setView("calendar")}
          className={cn("flex h-6 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium", view === "calendar" ? "bg-card text-foreground shadow-[0_1px_2px_rgba(21,22,23,0.06)]" : "text-[var(--ink3)]")}
        >
          <CalendarDays className="size-3.5" /> Calendar
        </button>
        <button
          onClick={() => setView("board")}
          className={cn("flex h-6 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium", view === "board" ? "bg-card text-foreground shadow-[0_1px_2px_rgba(21,22,23,0.06)]" : "text-[var(--ink3)]")}
        >
          <Columns3 className="size-3.5" /> Board
        </button>
      </div>

      {view === "board" ? (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {POST_STATUS_ORDER.map((status) => (
              <DemoColumn key={status} status={status} posts={posts.filter((p) => p.status === status)} />
            ))}
          </div>
        </DndContext>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="space-y-2">
            {scheduled.map((post) => (
              <Link
                key={post.id}
                href={`/demo/posts/${post.id}`}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-sm hover:border-[var(--ink4)]"
              >
                <div className="flex items-center gap-2.5">
                  <StatusRing status={post.status} size={15} />
                  <span className="font-medium">{post.title}</span>
                </div>
                <span className="om-mono text-[var(--ink3)]">{format(new Date(post.scheduledAt!), "EEE d MMM, h:mm a")}</span>
              </Link>
            ))}
          </div>
          <div className="space-y-2">
            <p className="om-eyebrow">Unscheduled ideas</p>
            {unscheduled.length === 0 && <p className="text-sm text-[var(--ink3)]">Nothing unscheduled.</p>}
            {unscheduled.map((post) => (
              <Link key={post.id} href={`/demo/posts/${post.id}`} className="block rounded-lg border border-border p-2.5 text-sm hover:border-[var(--ink4)]">
                <p className="font-medium">{post.title}</p>
                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--ink3)]">
                  <StatusRing status={post.status} size={13} /> {POST_STATUS_LABELS[post.status]}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DemoColumn({ status, posts }: { status: PostStatus; posts: DemoPost[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className="flex w-[240px] shrink-0 flex-col gap-2 rounded-[10px] border border-border bg-[var(--fill)] p-2"
      style={isOver ? { background: "var(--accent-soft)" } : undefined}
    >
      <div className="flex items-center gap-1.5 px-1 py-1">
        <StatusRing status={status} size={13} />
        <span className="text-xs font-medium text-[var(--ink2)]">{POST_STATUS_LABELS[status]}</span>
        <span className="om-mono ml-auto text-[var(--ink4)]">{posts.length}</span>
      </div>
      <div className="flex min-h-8 flex-col gap-1.5">
        {posts.map((post) => <DemoCard key={post.id} post={post} />)}
      </div>
    </div>
  );
}

function DemoCard({ post }: { post: DemoPost }) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: post.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => !isDragging && router.push(`/demo/posts/${post.id}`)}
      className="cursor-grab rounded-lg border border-border bg-card p-2.5 text-sm shadow-[0_1px_1px_rgba(21,22,23,0.03)] active:cursor-grabbing"
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined,
        position: isDragging ? "relative" : undefined,
      }}
    >
      <p className="line-clamp-2 font-medium">{post.title}</p>
      <div className="mt-1.5 flex items-center justify-between text-xs text-[var(--ink3)]">
        <span>{post.assignedDesigner ?? post.assignedWriter ?? "Unassigned"}</span>
        {post.scheduledAt && <span className="om-mono">{format(new Date(post.scheduledAt), "d MMM")}</span>}
      </div>
    </div>
  );
}
