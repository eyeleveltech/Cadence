"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { getPost } from "@/lib/actions/posts";
import type { listMediaAssets } from "@/lib/actions/media";
import {
  updatePostContent, updatePostStatus, attachAssetToPost, removeAssetFromPost, addApprovalComment,
  deletePost, publishPostNow,
} from "@/lib/actions/posts";
import { setPostCampaign } from "@/lib/actions/campaigns";
import { POST_STATUS_LABELS, POST_STATUS_ORDER, POST_STATUS_ADVANCE_SEQUENCE } from "@/lib/roles";
import { StatusChip } from "@/components/status-ring";
import { PerformancePanel } from "./performance-panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Instagram, Facebook, Linkedin, Youtube, X, Plus, Check, RotateCcw, Trash2, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import type { Platform as PrismaPlatform } from "@prisma/client";

type Platform = PrismaPlatform | "TWITTER";

type Post = Awaited<ReturnType<typeof getPost>>;
type LibraryAsset = Awaited<ReturnType<typeof listMediaAssets>>[number];

function XTwitterIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" className={className} {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 24.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const PLATFORMS: { value: Platform; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "INSTAGRAM", label: "Instagram", icon: Instagram },
  { value: "FACEBOOK", label: "Facebook", icon: Facebook },
  { value: "LINKEDIN", label: "LinkedIn", icon: Linkedin },
  { value: "YOUTUBE", label: "YouTube", icon: Youtube },
  { value: "TWITTER", label: "Twitter", icon: XTwitterIcon },
];

function getVideoPlayUrl(url: string): string {
  if (url.includes("res.cloudinary.com")) {
    return url.replace(/\.[^/.]+$/, ".mp4");
  }
  return url;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

export function PostEditor({
  post, libraryAssets, currentUser, designers, writers, campaigns,
}: {
  post: Post;
  libraryAssets: LibraryAsset[];
  currentUser: { id: string; name: string; role: string };
  designers: { id: string; name: string }[];
  writers: { id: string; name: string }[];
  campaigns: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [caption, setCaption] = useState(post.caption ?? "");
  const [hashtagsRaw, setHashtagsRaw] = useState(post.hashtags.join(", "));
  const [collaboratorsRaw, setCollaboratorsRaw] = useState(post.collaborators.join(", "));
  const [platforms, setPlatforms] = useState<Platform[]>(post.platforms);
  const [postAsStory, setPostAsStory] = useState(post.postAsStory);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);

  const attachedIds = new Set(post.assets.map((a) => a.mediaAssetId));
  const unattached = libraryAssets.filter((a) => !attachedIds.has(a.id) && a.status === "READY");

  const advanceIndex = POST_STATUS_ADVANCE_SEQUENCE.indexOf(post.status);
  const nextStatus =
    advanceIndex >= 0 && advanceIndex < POST_STATUS_ADVANCE_SEQUENCE.length - 1
      ? POST_STATUS_ADVANCE_SEQUENCE[advanceIndex + 1]
      : null;

  function togglePlatform(p: Platform) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updatePostContent({
        postId: post.id,
        caption,
        hashtags: hashtagsRaw.split(",").map((h) => h.trim().replace(/^#/, "")).filter(Boolean),
        collaborators: collaboratorsRaw.split(",").map((c) => c.trim().replace(/^@/, "")).filter(Boolean).slice(0, 3),
        platforms,
        postAsStory,
      });
      toast.success("Saved");
      router.refresh();
    } catch {
      toast.error("Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  // Every one of these can now be refused by the server — an unapproved
  // post can't be scheduled, a writer can't approve their own work. The
  // refusal carries the reason, so surface it rather than swallowing it.
  async function run(work: () => Promise<unknown>, fallback: string) {
    try {
      await work();
      router.refresh();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : fallback);
      return false;
    }
  }

  async function handleAdvance() {
    if (!nextStatus) return;
    await run(() => updatePostStatus(post.id, nextStatus), "Couldn't move that post");
  }

  async function handleDirectStatus(status: string) {
    await run(() => updatePostStatus(post.id, status as Post["status"]), "Couldn't move that post");
  }

  async function handleAttach(assetId: string) {
    const ok = await run(() => attachAssetToPost(post.id, assetId, post.assets.length), "Couldn't attach that asset");
    if (ok) setAttachOpen(false);
  }

  async function handleCampaign(campaignId: string) {
    await run(
      () => setPostCampaign({ postId: post.id, campaignId: campaignId && campaignId !== "none" ? campaignId : null }),
      "Couldn't file that post",
    );
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${post.title}"? This can't be undone.`)) return;
    try {
      await deletePost(post.id);
      toast.success("Post deleted");
      router.push(`/clients/${post.clientId}/plan`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete that post");
    }
  }

  async function handleAssign(kind: "designer" | "writer", userId: string) {
    await run(
      () => updatePostContent({
        postId: post.id,
        ...(kind === "designer" ? { assignedDesignerId: userId || null } : { assignedWriterId: userId || null }),
      }),
      "Couldn't assign that person",
    );
  }

  async function handleComment(type: "COMMENT" | "APPROVAL" | "REVISION_REQUEST") {
    const body = type === "COMMENT" ? commentBody : commentBody || `${type === "APPROVAL" ? "Approved" : "Revision requested"}`;
    if (!body.trim()) return;
    const ok = await run(() => addApprovalComment({ postId: post.id, body: body.trim(), type }), "Couldn't post that");
    if (ok) setCommentBody("");
  }

  async function handleConfirmPublish() {
    setPublishing(true);
    try {
      await publishPostNow(post.id);
      setPublishConfirmOpen(false);
      toast.success("Post published successfully!");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publishing failed");
    } finally {
      setPublishing(false);
    }
  }

  // Internal review is a manager's call — writers/designers can comment
  // but not approve their own work. Client-stage approval normally
  // happens through /review by the actual client; a manager can still
  // record it here on their behalf (a phone call, a WhatsApp thumbs up).
  const isLeadership = currentUser.role === "ADMIN" || currentUser.role === "MANAGER";
  // Mirrors assertMayDecide in lib/actions/posts.ts. It is a mirror, not
  // the rule — the rule lives on the server, because this file ships to
  // the browser and the action is reachable without it.
  const ownsTheWork =
    post.assignedWriterId === currentUser.id || post.assignedDesignerId === currentUser.id;
  // Mirrors deletePost: published posts stay, and otherwise it's
  // leadership or whoever created it.
  const canDelete =
    post.status !== "PUBLISHED" && (isLeadership || post.createdById === currentUser.id);
  const canReview =
    isLeadership && !ownsTheWork && (post.status === "INTERNAL_REVIEW" || post.status === "CLIENT_REVIEW");
  const captionCount = caption.length;

  const latestByPlatform: Partial<Record<Platform, (typeof post.analyticsSnapshots)[number]>> = {};
  for (const snap of post.analyticsSnapshots) {
    const existing = latestByPlatform[snap.platform];
    if (!existing || snap.pulledAt > existing.pulledAt) latestByPlatform[snap.platform] = snap;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <Dialog open={publishConfirmOpen} onOpenChange={setPublishConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="size-4 text-primary" /> Publish to Social Media
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <p className="text-[var(--ink2)]">
              Publish <span className="font-semibold text-foreground">&ldquo;{post.title}&rdquo;</span> immediately to the selected channels:
            </p>
            <div className="flex flex-wrap gap-2 py-1">
              {post.platforms.map((p) => {
                const plat = PLATFORMS.find((x) => x.value === p);
                const Icon = plat?.icon;
                return (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-[var(--surface-hover)] px-2.5 py-1 text-xs font-medium text-foreground"
                  >
                    {Icon && <Icon className="size-3 text-primary" />}
                    {plat?.label ?? p}
                  </span>
                );
              })}
            </div>
            <p className="text-xs text-[var(--ink3)]">
              This delivers the post immediately through the connected accounts or simulation sandbox.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPublishConfirmOpen(false)}
              disabled={publishing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmPublish}
              disabled={publishing}
            >
              <Send className="size-3.5" />
              {publishing ? "Publishing…" : "Publish Now"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div>
        <Link href={`/clients/${post.clientId}/plan`} className="text-xs text-[var(--ink3)] hover:underline">
          ← {post.client.name}
        </Link>
        <div className="mt-1 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">{post.title}</h1>
          <div className="flex items-center gap-2">
            <StatusChip status={post.status} />
            {isLeadership && post.status !== "PUBLISHED" && post.platforms.length > 0 && (
              <Button
                size="sm"
                variant="default"
                onClick={() => setPublishConfirmOpen(true)}
                disabled={publishing}
              >
                <Send className="size-3.5" />
                Publish
              </Button>
            )}
            {nextStatus && (
              <Button size="sm" variant="outline" onClick={handleAdvance}>
                Advance → {POST_STATUS_LABELS[nextStatus]}
              </Button>
            )}
            {canDelete && (
              <Button size="sm" variant="outline" onClick={handleDelete} title="Delete this post">
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
        {post.brief && <p className="mt-1 text-sm text-[var(--ink3)]">{post.brief}</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Panel title="Platforms">
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={platforms.includes(value) ? "default" : "outline"}
                  onClick={() => togglePlatform(value)}
                >
                  <Icon className="size-3.5" /> {label}
                </Button>
              ))}
            </div>

            {platforms.includes("INSTAGRAM") && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={postAsStory}
                  onChange={(e) => setPostAsStory(e.target.checked)}
                  className="size-4"
                />
                Also post as Instagram Story (fires ~10 min after the feed post)
              </label>
            )}
          </Panel>

          <Panel title="Assets">
            <div className="flex flex-wrap gap-3">
              {post.assets.map((pa) => {
                const thumb = pa.mediaAsset.variants.find((v) => v.kind === "THUMBNAIL");
                return (
                  <div key={pa.id} className="group relative size-24 overflow-hidden rounded-xl border border-border bg-[var(--fill)]">
                    {pa.mediaAsset.originalKind === "IMAGE" ? (
                      <Image
                        src={thumb?.url ?? pa.mediaAsset.originalUrl}
                        alt=""
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <video
                        src={getVideoPlayUrl(pa.mediaAsset.originalUrl)}
                        className="size-full object-cover"
                        muted
                        playsInline
                      />
                    )}
                    <button
                      onClick={async () => {
                        await removeAssetFromPost(post.id, pa.mediaAssetId);
                        router.refresh();
                      }}
                      className="absolute right-1 top-1 hidden rounded bg-black/60 p-0.5 text-white group-hover:block"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                );
              })}
              <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
                <DialogTrigger className="flex size-24 items-center justify-center rounded-xl border border-dashed border-border text-[var(--ink3)] hover:border-primary hover:text-primary">
                  <Plus className="size-5" />
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader><DialogTitle>Attach from library</DialogTitle></DialogHeader>
                  {unattached.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nothing available — upload to the library first.
                    </p>
                  ) : (
                    <div className="grid max-h-96 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
                      {unattached.map((asset) => {
                        const thumb = asset.variants.find((v) => v.kind === "THUMBNAIL");
                        return (
                          <button
                            key={asset.id}
                            onClick={() => handleAttach(asset.id)}
                            className="relative aspect-square overflow-hidden rounded-lg border border-border hover:ring-2 hover:ring-primary"
                          >
                            {asset.originalKind === "IMAGE" ? (
                              <Image src={thumb?.url ?? asset.originalUrl} alt="" fill className="object-cover" unoptimized />
                            ) : (
                              <video src={getVideoPlayUrl(asset.originalUrl)} className="size-full object-cover" muted playsInline />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          </Panel>

          <Panel title="Caption">
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={5}
              placeholder="Write the caption…"
            />
            <p className="text-right text-xs text-[var(--ink3)]">{captionCount} / 2200</p>

            <div className="space-y-1.5">
              <Label htmlFor="hashtags">Hashtags (comma-separated)</Label>
              <Input
                id="hashtags"
                value={hashtagsRaw}
                onChange={(e) => setHashtagsRaw(e.target.value)}
                placeholder="chennaifood, healthcare, eyelevel"
              />
            </div>

            {platforms.includes("INSTAGRAM") && (
              <div className="space-y-1.5">
                <Label htmlFor="collabs">Collaborators — up to 3 Instagram usernames</Label>
                <Input
                  id="collabs"
                  value={collaboratorsRaw}
                  onChange={(e) => setCollaboratorsRaw(e.target.value)}
                  placeholder="username_one, username_two"
                />
              </div>
            )}

            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Assignment">
            <div className="space-y-1.5">
              <Label>Campaign</Label>
              <Select
                items={{ none: "No campaign", ...Object.fromEntries(campaigns.map((c) => [c.id, c.name])) }}
                value={post.campaignId ?? "none"}
                onValueChange={(v) => handleCampaign(v ?? "none")}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No campaign</SelectItem>
                  {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {campaigns.length === 0 && (
                <p className="text-xs text-[var(--ink3)]">
                  No campaigns yet — create one from the client&apos;s Plan.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Designer</Label>
              <Select
                items={{ none: "Unassigned", ...Object.fromEntries(designers.map((d) => [d.id, d.name])) }}
                value={post.assignedDesigner?.id ?? "none"}
                onValueChange={(v) => handleAssign("designer", !v || v === "none" ? "" : v)}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {designers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Writer</Label>
              <Select
                items={{ none: "Unassigned", ...Object.fromEntries(writers.map((w) => [w.id, w.name])) }}
                value={post.assignedWriter?.id ?? "none"}
                onValueChange={(v) => handleAssign("writer", !v || v === "none" ? "" : v)}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {writers.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Jump to stage</Label>
              <Select
                items={POST_STATUS_LABELS}
                value={post.status}
                onValueChange={(v) => v && handleDirectStatus(v)}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {POST_STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{POST_STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </Panel>

          <Panel title="Approval Thread">
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {post.comments.length === 0 && (
                <p className="text-sm text-[var(--ink3)]">No comments yet.</p>
              )}
              {post.comments.map((c) => (
                <div key={c.id} className="rounded-xl border border-border p-3 text-sm">
                  <div className="flex items-center justify-between text-xs text-[var(--ink3)]">
                    <span className="font-medium text-foreground">{c.author.name}</span>
                    <span>{formatDistanceToNow(c.createdAt, { addSuffix: true })}</span>
                  </div>
                  {c.type !== "COMMENT" && (
                    <span className={`om-pill my-1 ${c.type === "APPROVAL" ? "om-pill-good" : "om-pill-bad"}`}>
                      {c.type === "APPROVAL" ? "Approved" : "Revision requested"}
                    </span>
                  )}
                  <p>{c.body}</p>
                </div>
              ))}
            </div>
            <Textarea
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              rows={2}
              placeholder="Add a comment…"
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => handleComment("COMMENT")} disabled={!commentBody.trim()}>
                Comment
              </Button>
              {canReview && (
                <>
                  <Button size="sm" onClick={() => handleComment("APPROVAL")}>
                    <Check className="size-3.5" /> Approve
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleComment("REVISION_REQUEST")}>
                    <RotateCcw className="size-3.5" /> Request Revision
                  </Button>
                </>
              )}
            </div>
          </Panel>

          {post.status === "PUBLISHED" && post.platforms.length > 0 && (
            <Panel title="Performance">
              <PerformancePanel postId={post.id} platforms={post.platforms} latestByPlatform={latestByPlatform} />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
