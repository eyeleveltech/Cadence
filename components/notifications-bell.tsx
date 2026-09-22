"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "cn";
import { formatDistanceToNow } from "date-fns";
import {
  listNotifications, markNotificationRead, markAllNotificationsRead,
} from "@/lib/actions/notifications";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function NotificationsBell() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: listNotifications,
    refetchInterval: 60_000, // SSE pushes the real-time nudge; this is just a safety net
  });
  const unread = notifications.filter((n) => !n.read).length;

  // The bell's own live-push channel — an SSE event just invalidates the
  // query above so TanStack Query stays the single source of truth.
  const esRef = useRef<EventSource | null>(null);
  useEffect(() => {
    const es = new EventSource("/api/notifications/stream");
    esRef.current = es;
    es.onmessage = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });
    return () => es.close();
  }, [queryClient]);

  async function handleOpenNotification(id: string, link: string | null, read: boolean) {
    if (!read) {
      await markNotificationRead(id);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
    if (link) router.push(link);
  }

  async function handleMarkAll() {
    await markAllNotificationsRead();
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex h-8 items-center gap-2.5 rounded-lg border border-transparent px-2.5 text-sm font-medium text-[var(--ink2)] transition-colors hover:bg-white/60 hover:text-foreground",
        )}
      >
        <span className="relative flex">
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 om-mono text-[9px] text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </span>
        <span>Notifications</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[380px] max-w-[90vw] rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(21,22,23,0.04),0_8px_24px_-16px_rgba(21,22,23,0.08)]"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Notifications</h2>
          {unread > 0 && (
            <button
              onClick={handleMarkAll}
              className="flex items-center gap-1 text-xs font-medium text-[var(--ink3)] transition-colors hover:text-foreground"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          )}
        </div>
        <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto">
          {notifications.length === 0 && (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-[var(--ink3)]">
              You&apos;re caught up.
            </p>
          )}
          {notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => handleOpenNotification(n.id, n.link, n.read)}
              className={cn(
                "flex w-full flex-col gap-1 rounded-xl border border-border p-3.5 text-left transition-colors hover:border-[var(--ink4)]",
                !n.read && "bg-[var(--accent-soft)]/40",
              )}
            >
              <div className="flex items-center gap-2">
                {!n.read && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                <span className="truncate text-sm font-medium">{n.title}</span>
                <span className="om-mono ml-auto shrink-0 text-[var(--ink4)]">
                  {formatDistanceToNow(n.createdAt, { addSuffix: true })}
                </span>
              </div>
              <p className="line-clamp-2 text-xs text-[var(--ink3)]">{n.body}</p>
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
