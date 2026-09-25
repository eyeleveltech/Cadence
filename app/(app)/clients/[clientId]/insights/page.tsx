import Link from "next/link";
import { BarChart3, Instagram, Facebook, Linkedin, Youtube } from "lucide-react";
import { format } from "date-fns";
import { getClientAnalyticsOverview } from "@/lib/actions/analytics";
import type { Platform } from "@prisma/client";

function XTwitterIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" className={className} {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 24.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const PLATFORM_ICON: Record<Platform, React.ComponentType<{ className?: string }>> = {
  INSTAGRAM: Instagram, FACEBOOK: Facebook, LINKEDIN: Linkedin, YOUTUBE: Youtube, TWITTER: XTwitterIcon,
};
const PLATFORM_LABEL: Record<Platform, string> = {
  INSTAGRAM: "Instagram", FACEBOOK: "Facebook", LINKEDIN: "LinkedIn", YOUTUBE: "YouTube", TWITTER: "X (Twitter)",
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <span className="om-eyebrow">{label}</span>
      <p className="om-num mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

export default async function InsightsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const overview = await getClientAnalyticsOverview(clientId);

  if (!overview.hasData) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-16 text-center">
          <BarChart3 className="size-7 text-[var(--ink3)]" />
          <p className="text-lg font-bold tracking-tight">No analytics yet</p>
          <p className="max-w-md text-sm text-[var(--ink3)]">
            Reach, impressions, engagement, saves and shares appear here once metrics are logged against a
            published post. Nothing is estimated — we only show numbers that have actually been recorded.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total reach" value={overview.totalReach.toLocaleString()} />
        <StatCard label="Total engagement" value={overview.totalEngagements.toLocaleString()} />
        <StatCard
          label="Engagement rate"
          value={overview.engagementRate !== null ? `${overview.engagementRate.toFixed(1)}%` : "—"}
        />
        <StatCard label="Posts with data" value={String(overview.postsWithData)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">By platform</h2>
          <div className="mt-4 space-y-2">
            {overview.platformBreakdown.map(({ platform, reach, engagements, posts }) => {
              const Icon = PLATFORM_ICON[platform];
              return (
                <div key={platform} className="flex items-center justify-between rounded-xl border border-border p-3.5">
                  <div className="flex items-center gap-2.5">
                    <Icon className="size-4 text-[var(--ink3)]" />
                    <span className="text-sm font-medium">{PLATFORM_LABEL[platform]}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-[var(--ink3)]">
                    <span><span className="om-num text-foreground">{reach.toLocaleString()}</span> reach</span>
                    <span><span className="om-num text-foreground">{engagements.toLocaleString()}</span> eng.</span>
                    <span className="om-num">{posts} post{posts === 1 ? "" : "s"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Top posts</h2>
          <div className="mt-4 space-y-2">
            {overview.topPosts.map((post) => {
              const Icon = PLATFORM_ICON[post.platform];
              return (
                <Link
                  key={`${post.id}-${post.platform}`}
                  href={`/posts/${post.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border p-3.5 transition-colors hover:border-[var(--ink4)]"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Icon className="size-4 shrink-0 text-[var(--ink3)]" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{post.title}</p>
                      {post.scheduledAt && (
                        <p className="om-mono text-[var(--ink4)]">{format(post.scheduledAt, "d MMM yyyy")}</p>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-sm">
                    <p className="om-num font-medium">{post.engagements.toLocaleString()}</p>
                    <p className="text-xs text-[var(--ink3)]">engagement</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
