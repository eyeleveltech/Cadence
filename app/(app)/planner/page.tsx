import Link from "next/link";
import { CalendarDays, Inbox, MessageSquare } from "lucide-react";
import { getMyPlannerData } from "@/lib/actions/planner";
import { StatusRing } from "@/components/status-ring";
import { POST_STATUS_LABELS, COMM_TYPE_LABELS, ROLE_LABELS } from "@/lib/roles";
import { formatDistanceToNow, format } from "date-fns";

export default async function PlannerPage() {
  const { user, clients, myPosts, recentComms } = await getMyPlannerData();
  const firstName = user.name.split(" ")[0];

  return (
    <div className="space-y-8 px-8 pt-[26px] pb-8">
      <div className="space-y-1">
        <span className="text-sm text-[var(--ink3)]">{format(new Date(), "EEEE d MMMM")}</span>
        <h1 className="text-[32px] font-bold tracking-[-0.02em] leading-tight">Hello, {firstName}</h1>
        <p className="text-sm text-[var(--ink3)]">{user.email} · everything below is scoped to the clients you can access.</p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-[var(--ink3)]" />
          <span className="om-eyebrow">My clients</span>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {clients.map((client) => (
            <Link
              key={client.id}
              href={`/clients/${client.id}/plan`}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-4 transition-colors hover:border-[var(--ink4)] hover:shadow-[0_1px_2px_rgba(21,22,23,0.04),0_8px_24px_-16px_rgba(21,22,23,0.08)]"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="truncate text-lg font-semibold">{client.name}</span>
                <span className={`shrink-0 om-pill ${client.status === "ACTIVE" ? "om-pill-solid" : ""}`}>
                  {client.status === "ACTIVE" ? "Active" : client.status === "PAUSED" ? "Paused" : "Churned"}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm text-[var(--ink3)]">
                <span className="om-num">{client._count.posts} posts</span>
                <span>
                  {client.posts[0]?.scheduledAt ? `Next ${format(client.posts[0].scheduledAt, "d MMM, HH:mm")}` : "Nothing scheduled"}
                </span>
              </div>
            </Link>
          ))}
          {clients.length === 0 && (
            <p className="col-span-full rounded-2xl border border-dashed border-border bg-card/60 px-4 py-6 text-center text-sm text-[var(--ink3)]">
              No clients assigned yet.
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Inbox className="size-4 text-[var(--ink3)]" />
            <span className="om-eyebrow">My queue</span>
          </div>
          {myPosts.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card px-5 py-6 text-sm text-[var(--ink3)]">
              Nothing is assigned to you right now.
            </div>
          ) : (
            <div className="space-y-2">
              {myPosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/posts/${post.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 transition-colors hover:border-[var(--ink4)] hover:shadow-[0_1px_2px_rgba(21,22,23,0.04)]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{post.title}</p>
                    <p className="text-xs text-[var(--ink3)]">{post.client.name}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-[var(--ink2)]">
                    <StatusRing status={post.status} size={14} />
                    {POST_STATUS_LABELS[post.status]}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="size-4 text-[var(--ink3)]" />
            <span className="om-eyebrow">Recent client communication</span>
          </div>
          <div className="space-y-2">
            {recentComms.map((entry) => {
              return (
                <Link
                  key={entry.id}
                  href={`/clients/${entry.clientId}/comms`}
                  className="block rounded-2xl border border-border bg-card px-5 py-4 transition-colors hover:border-[var(--ink4)] hover:shadow-[0_1px_2px_rgba(21,22,23,0.04),0_8px_24px_-16px_rgba(21,22,23,0.08)]"
                >
                  <div className="flex items-center gap-2">
                    <span className="om-pill">{COMM_TYPE_LABELS[entry.type]}</span>
                    <span className="text-sm font-medium">{entry.client.name}</span>
                    <span className="om-mono ml-auto shrink-0 text-[var(--ink4)]">
                      {formatDistanceToNow(entry.occurredAt, { addSuffix: true })}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--ink2)]">{entry.summary}</p>
                  <p className="mt-2 text-xs text-[var(--ink3)]">by {entry.loggedBy.name} ({ROLE_LABELS[entry.loggedBy.role]})</p>
                </Link>
              );
            })}
            {recentComms.length === 0 && (
              <div className="rounded-2xl border border-border bg-card px-5 py-6 text-center text-sm text-[var(--ink3)]">
                Nothing logged yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
