"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { PostStatus } from "@prisma/client";
import { updatePostStatus } from "@/lib/actions/posts";
import type { listPostsForClient } from "@/lib/actions/posts";
import { POST_STATUS_LABELS, POST_STATUS_ORDER } from "@/lib/roles";
import { StatusRing } from "@/components/status-ring";
import { toast } from "sonner";
import { format } from "date-fns";

type Post = Awaited<ReturnType<typeof listPostsForClient>>[number];

export function PlanBoard({ posts: initialPosts }: { posts: Post[] }) {
  const router = useRouter();
  const [posts, setPosts] = useState(initialPosts);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const columns = POST_STATUS_ORDER.map((status) => ({
    status,
    posts: posts.filter((p) => p.status === status),
  }));

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const postId = active.id as string;
    const nextStatus = over.id as PostStatus;
    const post = posts.find((p) => p.id === postId);
    if (!post || post.status === nextStatus) return;

    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: nextStatus } : p)));
    try {
      await updatePostStatus(postId, nextStatus);
    } catch (err) {
      // The server refuses moves that skip approval, or that only an
      // admin can make. Show that reason — "couldn't move that post"
      // leaves someone dragging the same card again and again.
      toast.error(err instanceof Error ? err.message : "Couldn't move that post");
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: post.status } : p)));
    }
    router.refresh();
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((col) => (
          <Column key={col.status} status={col.status} posts={col.posts} />
        ))}
      </div>
    </DndContext>
  );
}

function Column({ status, posts }: { status: PostStatus; posts: Post[] }) {
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
        {posts.map((post) => <Card key={post.id} post={post} />)}
      </div>
    </div>
  );
}

function Card({ post }: { post: Post }) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: post.id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => !isDragging && router.push(`/posts/${post.id}`)}
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
        <span>{post.assignedDesigner?.name ?? post.assignedWriter?.name ?? "Unassigned"}</span>
        {post.scheduledAt && <span className="om-mono">{format(post.scheduledAt, "d MMM, HH:mm")}</span>}
      </div>
    </div>
  );
}
