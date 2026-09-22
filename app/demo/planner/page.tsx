import Link from "next/link";
import { Phone, MessageCircle, Mail, Users, FileText } from "lucide-react";
import { StatusRing } from "@/components/status-ring";
import { POST_STATUS_LABELS, COMM_TYPE_LABELS } from "@/lib/roles";
import { DEMO_CLIENTS, DEMO_POSTS, DEMO_COMMS } from "@/lib/demo/data";
import { formatDistanceToNow, format } from "date-fns";
import type { CommType } from "@prisma/client";

const COMM_ICON: Record<CommType, typeof Phone> = {
  CALL: Phone, WHATSAPP: MessageCircle, EMAIL: Mail, MEETING: Users, BRIEF_UPDATE: FileText,
};

export default function DemoPlannerPage() {
  const myPosts = DEMO_POSTS.filter((p) => p.status !== "PUBLISHED" && p.status !== "FAILED")
    .sort((a, b) => new Date(a.scheduledAt ?? 0).getTime() - new Date(b.scheduledAt ?? 0).getTime())
    .slice(0, 6);

  return (
    <div className="space-y-7 px-8 pt-[26px] pb-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] leading-7">Planner</h1>
        <span className="om-mono text-[var(--ink3)]">{format(new Date(), "EEE d MMM yyyy").toUpperCase()}</span>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="om-eyebrow">My clients</span>
          <span className="om-mono text-[var(--ink4)]">{DEMO_CLIENTS.length}</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {DEMO_CLIENTS.map((client) => {
            const posts = DEMO_POSTS.filter((p) => p.clientId === client.id);
            const next = posts.filter((p) => p.scheduledAt).sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())[0];
            return (
              <Link
                key={client.id}
                href={`/demo/clients/${client.id}/plan`}
                className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-card px-4 py-3.5 transition-colors hover:border-[var(--ink4)]"
              >
                <span className="truncate text-sm font-medium">{client.name}</span>
                <div className="flex gap-1.5 text-xs text-[var(--ink3)]">
                  <span className="om-num">{posts.length} posts</span>
                  <span className="text-[var(--ink4)]">·</span>
                  <span className="truncate">{next ? `Next ${format(new Date(next.scheduledAt!), "MMM d, h:mm a")}` : "Nothing scheduled"}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="om-eyebrow">My queue</span>
          <span className="om-mono text-[var(--ink4)]">{myPosts.length}</span>
          <span className="ml-auto text-xs text-[var(--ink3)]">Posts assigned to you across every client</span>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="om-eyebrow border-b border-border pb-2.5 text-left" style={{ width: "44%" }}>Post</th>
              <th className="om-eyebrow border-b border-border pb-2.5 text-left">Client</th>
              <th className="om-eyebrow border-b border-border pb-2.5 text-left">Stage</th>
              <th className="om-eyebrow border-b border-border pb-2.5 text-right">Updated</th>
            </tr>
          </thead>
          <tbody>
            {myPosts.map((post) => {
              const client = DEMO_CLIENTS.find((c) => c.id === post.clientId)!;
              return (
                <tr key={post.id} className="group">
                  <td className="h-11 border-b border-[var(--row-hairline)] group-hover:bg-[var(--fill)]">
                    <Link href={`/demo/posts/${post.id}`} className="font-medium hover:underline">{post.title}</Link>
                  </td>
                  <td className="h-11 border-b border-[var(--row-hairline)] text-[var(--ink3)] group-hover:bg-[var(--fill)]">{client.name}</td>
                  <td className="h-11 border-b border-[var(--row-hairline)] group-hover:bg-[var(--fill)]">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--ink2)]">
                      <StatusRing status={post.status} size={14} />
                      {POST_STATUS_LABELS[post.status]}
                    </span>
                  </td>
                  <td className="om-mono h-11 border-b border-[var(--row-hairline)] text-right text-[var(--ink3)] group-hover:bg-[var(--fill)]">
                    {formatDistanceToNow(new Date(post.updatedAt), { addSuffix: true })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="space-y-1.5">
        <div className="flex items-center gap-2.5">
          <span className="om-eyebrow">Recent client communication</span>
        </div>
        <div className="flex flex-col">
          {DEMO_COMMS.map((entry) => {
            const Icon = COMM_ICON[entry.type];
            const client = DEMO_CLIENTS.find((c) => c.id === entry.clientId)!;
            return (
              <Link
                key={entry.id}
                href={`/demo/clients/${entry.clientId}/comms`}
                className="flex items-start gap-3.5 border-b border-[var(--row-hairline)] py-3 last:border-0"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-[7px] border border-border bg-background">
                  <Icon className="size-3.5 text-[var(--ink2)]" />
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">{client.name}</span>
                    <span className="om-pill">{COMM_TYPE_LABELS[entry.type]}</span>
                    <span className="om-mono ml-auto shrink-0 text-[var(--ink4)]">
                      {entry.loggedBy} · {formatDistanceToNow(new Date(entry.occurredAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm text-[var(--ink2)]">{entry.summary}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
