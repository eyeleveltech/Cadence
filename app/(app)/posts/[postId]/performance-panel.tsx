"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AnalyticsSnapshot, Platform } from "@prisma/client";
import { logPostAnalytics } from "@/lib/actions/analytics";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Instagram, Facebook, Linkedin, Youtube } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

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
  INSTAGRAM: "Instagram", FACEBOOK: "Facebook", LINKEDIN: "LinkedIn", YOUTUBE: "YouTube", TWITTER: "Twitter",
};

const FIELDS = [
  { key: "reach", label: "Reach" },
  { key: "impressions", label: "Impressions" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares" },
  { key: "saves", label: "Saves" },
] as const;

type MetricKey = (typeof FIELDS)[number]["key"];

export function PerformancePanel({
  postId,
  platforms,
  latestByPlatform,
}: {
  postId: string;
  platforms: Platform[];
  latestByPlatform: Partial<Record<Platform, AnalyticsSnapshot>>;
}) {
  return (
    <div className="space-y-4">
      {platforms.map((platform) => (
        <PlatformMetrics
          key={platform}
          postId={postId}
          platform={platform}
          latest={latestByPlatform[platform]}
        />
      ))}
    </div>
  );
}

function PlatformMetrics({
  postId,
  platform,
  latest,
}: {
  postId: string;
  platform: Platform;
  latest?: AnalyticsSnapshot;
}) {
  const router = useRouter();
  const Icon = PLATFORM_ICON[platform];
  const [values, setValues] = useState<Record<MetricKey, string>>({
    reach: latest?.reach?.toString() ?? "",
    impressions: latest?.impressions?.toString() ?? "",
    likes: latest?.likes?.toString() ?? "",
    comments: latest?.comments?.toString() ?? "",
    shares: latest?.shares?.toString() ?? "",
    saves: latest?.saves?.toString() ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await logPostAnalytics({
        postId,
        platform,
        reach: values.reach ? Number(values.reach) : undefined,
        impressions: values.impressions ? Number(values.impressions) : undefined,
        likes: values.likes ? Number(values.likes) : undefined,
        comments: values.comments ? Number(values.comments) : undefined,
        shares: values.shares ? Number(values.shares) : undefined,
        saves: values.saves ? Number(values.saves) : undefined,
      });
      toast.success(`${PLATFORM_LABEL[platform]} metrics saved`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save metrics");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-[var(--ink3)]" />
          <span className="text-sm font-medium">{PLATFORM_LABEL[platform]}</span>
        </div>
        {latest && (
          <span className="om-mono text-[var(--ink4)]">
            Updated {formatDistanceToNow(latest.pulledAt, { addSuffix: true })}
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {FIELDS.map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={`${platform}-${key}`} className="text-xs text-[var(--ink3)]">{label}</Label>
            <Input
              id={`${platform}-${key}`}
              type="number"
              min={0}
              inputMode="numeric"
              value={values[key]}
              onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
              placeholder="0"
              className="h-8 text-sm"
            />
          </div>
        ))}
      </div>
      <Button size="sm" className="mt-3" onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save metrics"}
      </Button>
    </div>
  );
}
