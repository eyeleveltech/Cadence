"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { getPost } from "@/lib/actions/posts";
import type { listMediaAssets } from "@/lib/actions/media";
import { classifyYouTubeVideo } from "@/lib/social/youtube";
import {
  updatePostContent, updatePostStatus, attachAssetToPost, removeAssetFromPost, addApprovalComment,
  deletePost, fireStoryNow,
} from "@/lib/actions/posts";
import { disconnectSocialAccount } from "@/lib/actions/social-accounts";
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
import {
  Instagram, Facebook, Linkedin, Youtube, X, Plus, Check, RotateCcw,
  Trash2, Send, Loader2, Library, ExternalLink, AlertTriangle, Zap,
  CheckCircle2, XCircle, Clock, Eye,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { PublishingActivityError } from "@/components/posts/publishing-activity";
import { uploadMediaFile } from "@/components/posts/asset-upload";
import { parseCustomCaptions } from "@/lib/social/caption";
import { PostPreviewModal } from "@/components/posts/post-preview-modal";
import type { Platform as PrismaPlatform } from "@prisma/client";

type Platform = PrismaPlatform | "TWITTER";

type Post = Awaited<ReturnType<typeof getPost>>;
type LibraryAsset = Awaited<ReturnType<typeof listMediaAssets>>[number];

export type SocialAccountSummary = {
  id: string;
  platform: PrismaPlatform;
  accountName: string;
  avatarUrl: string | null;
  connectionStatus: string;
  tokenExpiresAt: Date | null;
};

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

const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  LINKEDIN: "LinkedIn",
  YOUTUBE: "YouTube",
  TWITTER: "Twitter",
};

function getPlatformPermalink(platform: string, platformPostId: string | null, errorLog: string | null): string | null {
  if (errorLog && (errorLog.startsWith("http://") || errorLog.startsWith("https://"))) {
    return errorLog;
  }
  if (!platformPostId) return null;
  if (platformPostId.startsWith("http://") || platformPostId.startsWith("https://")) {
    return platformPostId;
  }
  switch (platform) {
    case "INSTAGRAM":
      return `https://www.instagram.com/p/${platformPostId}/`;
    case "FACEBOOK":
      return `https://www.facebook.com/${platformPostId}`;
    case "LINKEDIN":
      return `https://www.linkedin.com/feed/update/${platformPostId}`;
    case "TWITTER":
      return `https://x.com/i/status/${platformPostId}`;
    case "YOUTUBE":
      return `https://www.youtube.com/watch?v=${platformPostId}`;
    default:
      return null;
  }
}

function getScheduledCountdown(scheduledFor: string | Date): string {
  const target = new Date(scheduledFor).getTime();
  const diffSec = Math.max(0, Math.floor((target - Date.now()) / 1000));
  if (diffSec === 0) return "Due now";
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `in ${mins}m ${secs.toString().padStart(2, "0")}s`;
}

function getVideoPlayUrl(url: string): string {
  if (url.includes("res.cloudinary.com")) {
    return url.replace(/\.[^/.]+$/, ".mp4");
  }
  return url;
}

function Panel({
  title,
  headerAction,
  children,
}: {
  title: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {headerAction}
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

export function PostEditor({
  post,
  libraryAssets,
  currentUser,
  designers,
  writers,
  campaigns,
  socialAccounts = [],
}: {
  post: Post;
  libraryAssets: LibraryAsset[];
  currentUser: { id: string; name: string; role: string };
  designers: { id: string; name: string }[];
  writers: { id: string; name: string }[];
  campaigns: { id: string; name: string }[];
  socialAccounts?: SocialAccountSummary[];
}) {
  const router = useRouter();
  const initialCustom = parseCustomCaptions(post.caption);
  const [isCustomPerPlatform, setIsCustomPerPlatform] = useState(Boolean(initialCustom));
  const [caption, setCaption] = useState(initialCustom?.default ?? (initialCustom ? "" : (post.caption ?? "")));
  const [platformCaptions, setPlatformCaptions] = useState<Record<string, string>>({
    INSTAGRAM: initialCustom?.INSTAGRAM ?? (post.caption ?? ""),
    FACEBOOK: initialCustom?.FACEBOOK ?? (post.caption ?? ""),
    TWITTER: initialCustom?.TWITTER ?? (post.caption ?? ""),
    LINKEDIN: initialCustom?.LINKEDIN ?? (post.caption ?? ""),
    YOUTUBE: initialCustom?.YOUTUBE ?? (post.caption ?? ""),
    YOUTUBE_TITLE: initialCustom?.YOUTUBE_TITLE ?? post.title ?? "",
  });
  const [activePlatformTab, setActivePlatformTab] = useState<Platform>(
    post.platforms[0] ?? "INSTAGRAM"
  );
  const [availableLibraryAssets, setAvailableLibraryAssets] = useState<LibraryAsset[]>(libraryAssets);
  useEffect(() => {
    setAvailableLibraryAssets(libraryAssets);
  }, [libraryAssets]);

  const [hashtagsRaw, setHashtagsRaw] = useState(post.hashtags.join(", "));
  const [collaboratorsRaw, setCollaboratorsRaw] = useState(post.collaborators.join(", "));
  const [firstComment, setFirstComment] = useState(post.firstComment ?? "");
  const [firstCommentEnabled, setFirstCommentEnabled] = useState(Boolean(post.firstComment));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [platforms, setPlatforms] = useState<Platform[]>(post.platforms);
  const [postAsStory, setPostAsStory] = useState(post.postAsStory);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [firingStory, setFiringStory] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [oauthWarning, setOauthWarning] = useState<{ platform: string; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle OAuth callback parameters, notifications, and sanitize Meta's #_=_ fragment
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Sanitize Meta's #_=_ fragment from the URL immediately
    if (window.location.hash === "#_=_" || window.location.hash.includes("_=_")) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }

    const searchParams = new URLSearchParams(window.location.search);
    const connected = searchParams.get("connected");
    const warning = searchParams.get("warning");
    const warningMessage = searchParams.get("message");
    const oauthError = searchParams.get("oauth_error") || searchParams.get("error");
    const igConnected = searchParams.get("ig_connected") === "true";
    const fbConnected = searchParams.get("fb_connected") === "true";
    const platform = searchParams.get("platform");

    if ((warning === "no_pages_found" || warning) && platform !== "instagram") {
      const msg = warningMessage || "No Facebook Pages found under this account. Please create or manage a Page first.";
      toast.warning(msg, { duration: 8000 });
      setOauthWarning({
        platform: "facebook",
        message: msg,
      });
      window.history.replaceState(null, "", window.location.pathname);
    } else if (connected) {
      setOauthWarning(null);
      if (connected.includes("facebook") && (igConnected || connected.includes("instagram"))) {
        toast.success("Connected Facebook Page & linked Instagram account!");
      } else if (connected.includes("instagram") && (fbConnected || connected.includes("facebook"))) {
        toast.success("Connected Instagram account & linked Facebook Page!");
      } else if (connected === "instagram") {
        toast.success("Connected Instagram account!");
      } else {
        const platLabel = PLATFORM_DISPLAY_NAMES[connected.toUpperCase()] || connected;
        toast.success(`Connected ${platLabel}!`);
      }
      router.refresh();
      window.history.replaceState(null, "", window.location.pathname);
    } else if (oauthError) {
      toast.error(`Connection failed: ${decodeURIComponent(oauthError)}`, { duration: 6000 });
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [router]);

  // Live countdown update ticker for scheduled story jobs
  const [, setTick] = useState(0);
  useEffect(() => {
    const hasQueued = post.scheduledJobs.some((j) => j.status === "QUEUED");
    if (!hasQueued) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [post.scheduledJobs]);

  const attachedIds = new Set(post.assets.map((a) => a.mediaAssetId));
  const rawUnattached = availableLibraryAssets.filter((a) => !attachedIds.has(a.id) && a.status === "READY");
  const seenKeys = new Set<string>();
  const unattached: LibraryAsset[] = [];
  for (const asset of rawUnattached) {
    const key = asset.originalUrl?.trim().toLowerCase() || `${asset.fileSizeBytes}_${asset.mimeType}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      unattached.push(asset);
    }
  }

  // Synchronize activePlatformTab when selected platforms change
  useEffect(() => {
    if (platforms.length > 0 && !platforms.includes(activePlatformTab)) {
      setActivePlatformTab(platforms[0]);
    }
  }, [platforms, activePlatformTab]);

  const advanceIndex = POST_STATUS_ADVANCE_SEQUENCE.indexOf(post.status);
  const nextStatus =
    advanceIndex >= 0 && advanceIndex < POST_STATUS_ADVANCE_SEQUENCE.length - 1
      ? POST_STATUS_ADVANCE_SEQUENCE[advanceIndex + 1]
      : null;

  const missingConnections = platforms.filter(
    (p) => !socialAccounts.some((a) => a.platform === p && a.connectionStatus === "CONNECTED"),
  );

  const hasVideoAsset = post.assets.some((pa) => {
    if (pa.mediaAsset.originalKind === "VIDEO") return true;
    const mime = pa.mediaAsset.mimeType?.toLowerCase() ?? "";
    const url = pa.mediaAsset.originalUrl?.toLowerCase() ?? "";
    return (
      mime.startsWith("video/") ||
      url.endsWith(".mp4") ||
      url.endsWith(".mov") ||
      url.endsWith(".webm")
    );
  });
  const hasOnlyImages = post.assets.length > 0 && !hasVideoAsset;
  const youtubeMissingVideo = platforms.includes("YOUTUBE") && !hasVideoAsset;

  const twitterText = isCustomPerPlatform
    ? (platformCaptions.TWITTER ?? caption)
    : caption;
  const isTwitterTooLong = platforms.includes("TWITTER") && twitterText.length > 280;
  const twitterLength = twitterText.length;

  // Auto uncheck YouTube if all attached assets are images
  useEffect(() => {
    if (hasOnlyImages && platforms.includes("YOUTUBE")) {
      setPlatforms((prev) => prev.filter((p) => p !== "YOUTUBE"));
      toast.warning("YouTube unchecked: YouTube requires video media (.mp4, .mov)");
    }
  }, [hasOnlyImages, platforms]);

  function togglePlatform(p: Platform) {
    if (p === "YOUTUBE" && hasOnlyImages) {
      toast.warning("YouTube requires video media (.mp4, .mov)", { duration: 5000 });
      return;
    }
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function handleDeleteLibraryAsset(assetId: string, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!confirm("Are you sure you want to delete this media asset? It will be removed from Cadence and Cloudinary.")) {
      return;
    }
    try {
      const res = await fetch(`/api/media/${assetId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete asset");
      }
      setAvailableLibraryAssets((prev) => prev.filter((a) => a.id !== assetId));
      toast.success("Asset deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete asset");
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const finalCaption = isCustomPerPlatform
        ? JSON.stringify({
            _custom: true,
            default: caption,
            INSTAGRAM: platformCaptions.INSTAGRAM || caption,
            FACEBOOK: platformCaptions.FACEBOOK || caption,
            TWITTER: platformCaptions.TWITTER || caption,
            LINKEDIN: platformCaptions.LINKEDIN || caption,
            YOUTUBE: platformCaptions.YOUTUBE || caption,
            YOUTUBE_TITLE: platformCaptions.YOUTUBE_TITLE || post.title || "",
          })
        : caption;

      await updatePostContent({
        postId: post.id,
        caption: finalCaption,
        firstComment: firstCommentEnabled ? firstComment : null,
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
    if (status === "PUBLISHED") {
      setPublishConfirmOpen(true);
      return;
    }
    await run(() => updatePostStatus(post.id, status as Post["status"]), "Couldn't move that post");
  }

  async function handleAttach(assetId: string) {
    const ok = await run(() => attachAssetToPost(post.id, assetId, post.assets.length), "Couldn't attach that asset");
    if (ok) setAttachOpen(false);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const fileList = Array.from(files);
    const toastId = toast.loading(
      fileList.length === 1
        ? `Uploading ${fileList[0].name}…`
        : `Uploading ${fileList.length} media assets…`
    );

    try {
      let currentOrder = post.assets.length;
      let uploadedCount = 0;
      const failed: { name: string; reason: string }[] = [];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        try {
          // Deduplication: If asset with matching file size and filename exists in library, reuse it directly
          const existingInLibrary = libraryAssets.find((a) => {
            const assetFilename = decodeURIComponent(a.originalUrl.split("/").pop() ?? "").toLowerCase();
            const targetFilename = file.name.toLowerCase();
            const sizeMatches = a.fileSizeBytes === file.size;
            const nameMatches =
              assetFilename === targetFilename ||
              assetFilename.includes(targetFilename) ||
              targetFilename.includes(assetFilename);
            return sizeMatches && nameMatches;
          });

          if (existingInLibrary) {
            console.log(`[post-editor] Deduplication: Reusing library asset ${existingInLibrary.id} for ${file.name}`);
            await attachAssetToPost(post.id, existingInLibrary.id, currentOrder++);
            uploadedCount++;
            continue;
          }

          await uploadMediaFile(post.clientId, file, {
            postId: post.id,
            sortOrder: currentOrder++,
            onProgress: (pct) => {
              toast.loading(
                fileList.length === 1
                  ? `Uploading ${file.name}: ${pct}%…`
                  : `Uploading (${i + 1}/${fileList.length}) ${file.name}: ${pct}%…`,
                { id: toastId }
              );
            },
          });
          uploadedCount++;
        } catch (uploadErr) {
          failed.push({
            name: file.name,
            reason: uploadErr instanceof Error ? uploadErr.message : "Upload failed",
          });
        }
      }

      toast.dismiss(toastId);

      if (uploadedCount > 0) {
        toast.success(`Uploaded and attached ${uploadedCount} asset(s)`);
        router.refresh();
      }

      if (failed.length > 0) {
        for (const f of failed) {
          toast.error(`Failed to upload ${f.name}: ${f.reason}`, { duration: 6000 });
        }
      }
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(err instanceof Error ? err.message : "Failed to upload asset(s)");
    } finally {
      setUploading(false);
      if (e.target) e.target.value = "";
    }
  }

  async function handleDetach(assetId: string) {
    await run(() => removeAssetFromPost(post.id, assetId), "Couldn't detach that asset");
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
    if (missingConnections.length > 0) {
      toast.error(`${missingConnections.map((p) => PLATFORM_DISPLAY_NAMES[p] || p).join(", ")} must be connected before publishing.`);
      return;
    }
    if (platforms.includes("INSTAGRAM") && post.assets.length === 0) {
      toast.error("Instagram requires at least one image or video asset.");
      return;
    }
    if (youtubeMissingVideo) {
      toast.error("YouTube only supports video uploads (MP4, MOV). Please remove YouTube from this post or attach a video asset.");
      return;
    }

    setPublishing(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/publish`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Publishing failed");
      }
      setPublishConfirmOpen(false);
      toast.success("Post published successfully!");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publishing failed");
    } finally {
      setPublishing(false);
    }
  }

  async function handleFireStoryNow() {
    setFiringStory(true);
    try {
      await fireStoryNow(post.id);
      toast.success("Instagram Story published immediately!");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fire Instagram Story");
    } finally {
      setFiringStory(false);
    }
  }

  async function handleDisconnectAccount(accountId: string, platformName: string) {
    if (!window.confirm(`Disconnect ${platformName}? Posts targeting ${platformName} will not be able to publish until reconnected.`)) {
      return;
    }
    setDisconnectingId(accountId);
    try {
      await disconnectSocialAccount({ clientId: post.clientId, accountId });
      toast.success(`${platformName} disconnected`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to disconnect ${platformName}`);
    } finally {
      setDisconnectingId(null);
    }
  }

  const isLeadership = currentUser.role === "ADMIN" || currentUser.role === "MANAGER";
  const ownsTheWork =
    post.assignedWriterId === currentUser.id || post.assignedDesignerId === currentUser.id;
  const canReview =
    (post.status === "INTERNAL_REVIEW" && isLeadership && !ownsTheWork) ||
    (post.status === "CLIENT_REVIEW" && (currentUser.role === "CLIENT_REVIEWER" || isLeadership));
  const canDelete = post.status !== "PUBLISHED" && (isLeadership || post.createdById === currentUser.id);

  const latestByPlatform: Record<string, (typeof post.analyticsSnapshots)[number]> = {};
  for (const snap of post.analyticsSnapshots) {
    const existing = latestByPlatform[snap.platform];
    if (!existing || snap.pulledAt > existing.pulledAt) latestByPlatform[snap.platform] = snap;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PostPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        selectedPlatforms={platforms}
        clientName={post.client.name}
        caption={caption}
        hashtags={hashtagsRaw.split(",").map((h) => h.trim().replace(/^#/, "")).filter(Boolean)}
        firstComment={firstCommentEnabled ? firstComment : null}
        collaborators={collaboratorsRaw.split(",").map((c) => c.trim().replace(/^@/, "")).filter(Boolean)}
        assets={post.assets.map((pa) => ({
          id: pa.mediaAsset.id,
          url: pa.mediaAsset.originalUrl,
          mimeType: pa.mediaAsset.mimeType,
          originalKind: pa.mediaAsset.originalKind,
          width: pa.mediaAsset.width,
          height: pa.mediaAsset.height,
          durationSecs: pa.mediaAsset.durationSecs,
        }))}
        socialAccounts={socialAccounts.map((a) => ({
          platform: a.platform,
          accountName: a.accountName,
          avatarUrl: a.avatarUrl,
        }))}
        youtubeTitle={post.title}
        platformCaptions={platformCaptions}
        isCustomPerPlatform={isCustomPerPlatform}
      />

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
              {platforms.map((p) => {
                const plat = PLATFORMS.find((x) => x.value === p);
                const Icon = plat?.icon;
                const isConn = socialAccounts.some((a) => a.platform === p && a.connectionStatus === "CONNECTED");
                return (
                  <span
                    key={p}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${
                      isConn
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    {Icon && <Icon className="size-3" />}
                    {plat?.label ?? p}
                    {!isConn && " (Not Connected)"}
                  </span>
                );
              })}
            </div>

            {missingConnections.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 space-y-1.5">
                <div className="flex items-center gap-1 font-semibold">
                  <AlertTriangle className="size-3.5" /> Missing Account Connections
                </div>
                <p>
                  You must connect the missing accounts before publishing. Click the Connect button on the right card or under Platforms.
                </p>
              </div>
            )}

            {platforms.includes("INSTAGRAM") && post.assets.length === 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 space-y-1">
                <div className="flex items-center gap-1 font-semibold">
                  <AlertTriangle className="size-3.5" /> Missing Media Asset
                </div>
                <p>Instagram requires at least one image or video asset attached.</p>
              </div>
            )}

            {youtubeMissingVideo && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 space-y-1">
                <div className="flex items-center gap-1 font-semibold">
                  <AlertTriangle className="size-3.5" /> Video Required for YouTube
                </div>
                <p>YouTube only supports video uploads. Please attach a video asset or deselect YouTube before publishing.</p>
              </div>
            )}

            {isTwitterTooLong && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300 space-y-1">
                <div className="flex items-center gap-1 font-semibold">
                  <AlertTriangle className="size-3.5" /> Twitter Character Limit Exceeded
                </div>
                <p>Twitter / X post text is limited to 280 characters. Current length: {twitterLength} characters.</p>
              </div>
            )}

            <p className="text-xs text-[var(--ink3)]">
              This triggers live API publishing through connected platform accounts. Real platform post IDs and permalinks will be recorded.
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
              disabled={
                publishing ||
                missingConnections.length > 0 ||
                (platforms.includes("INSTAGRAM") && post.assets.length === 0) ||
                youtubeMissingVideo ||
                isTwitterTooLong
              }
            >
              {publishing ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" />
                  <span className="animate-pulse">Publishing…</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <Send className="size-3.5" />
                  Publish Now
                </span>
              )}
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
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPreviewOpen(true)}
              className="gap-1.5"
              title="Open live social feed mockup preview"
            >
              <Eye className="size-3.5" />
              Preview Feed
            </Button>
            {isLeadership && post.status !== "PUBLISHED" && platforms.length > 0 && (
              <Button
                size="sm"
                className="bg-primary text-primary-foreground font-semibold shadow-sm gap-1.5"
                onClick={() => setPublishConfirmOpen(true)}
                disabled={publishing || isTwitterTooLong}
                title={isTwitterTooLong ? `Twitter copy exceeds 280 characters (${twitterLength}/280)` : undefined}
              >
                {publishing ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="size-3.5 animate-spin" />
                    <span className="animate-pulse">Publishing…</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Send className="size-3.5" />
                    Publish Now
                  </span>
                )}
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
              {PLATFORMS.map(({ value, label, icon: Icon }) => {
                const isYouTubeDisabled = value === "YOUTUBE" && hasOnlyImages;
                return (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={platforms.includes(value) ? "default" : "outline"}
                    onClick={() => togglePlatform(value)}
                    disabled={isYouTubeDisabled}
                    className={`gap-1.5 ${isYouTubeDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                    title={isYouTubeDisabled ? "YouTube requires video media (.mp4, .mov)" : undefined}
                  >
                    <Icon className="size-3.5" /> {label}
                    {value === "YOUTUBE" && hasOnlyImages && (
                      <span className="ml-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-normal text-amber-700 dark:text-amber-400">
                        Requires video
                      </span>
                    )}
                    {value === "YOUTUBE" && !hasOnlyImages && platforms.includes("YOUTUBE") && !hasVideoAsset && (
                      <span className="ml-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-normal text-amber-700 dark:text-amber-400">
                        Requires video
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>

            {hasOnlyImages && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="size-3.5 shrink-0" />
                <span>YouTube is disabled: attached media are images. YouTube requires video media (.mp4, .mov).</span>
              </p>
            )}

            {/* Platform Pills with Single-@ Handle and Connection Warning */}
            {platforms.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                {platforms.map((p) => {
                  const platInfo = PLATFORMS.find((x) => x.value === p);
                  const Icon = platInfo?.icon ?? Send;
                  const connected = socialAccounts.find(
                    (a) => a.platform === p && a.connectionStatus === "CONNECTED",
                  );

                  if (connected) {
                    const cleanName = connected.accountName.startsWith("@")
                      ? `@${connected.accountName.replace(/^@+/, "")}`
                      : `@${connected.accountName}`;

                    return (
                      <div
                        key={p}
                        className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-700 dark:text-emerald-400"
                      >
                        <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <Icon className="size-3.5 shrink-0" />
                        <span>
                          <strong>{platInfo?.label ?? p}</strong>: Connected as {cleanName}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={p}
                      className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400"
                    >
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                        <Icon className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                        <span>
                          <strong>{platInfo?.label ?? p}</strong> is not connected for this client.
                        </span>
                      </div>
                      <a
                        href={`/api/oauth/${p.toLowerCase()}/init?clientId=${post.clientId}&returnTo=/posts/${post.id}`}
                        className="inline-flex h-6 items-center justify-center rounded-md border border-amber-500/30 bg-background px-2 text-xs font-medium text-foreground hover:bg-amber-500/20 transition-colors shrink-0"
                      >
                        Connect {platInfo?.label ?? p}
                      </a>
                    </div>
                  );
                })}

                {platforms.includes("INSTAGRAM") && post.assets.length === 0 && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                    <span>Instagram requires at least one image or video asset to publish.</span>
                  </div>
                )}

                {youtubeMissingVideo && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                    <span>YouTube only supports video uploads (MP4, MOV). Please attach a video asset.</span>
                  </div>
                )}
              </div>
            )}

            {platforms.includes("INSTAGRAM") && (
              <label className="flex items-center gap-2 text-sm pt-2">
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

          {/* Delivery Receipts UI: Publishing Activity & Live Links */}
          {post.scheduledJobs.length > 0 && (
            <Panel title="Publishing Activity & Live Links">
              <div className="divide-y divide-border rounded-xl border border-border">
                {post.scheduledJobs.map((job) => {
                  const isStory = job.idempotencyKey.endsWith(":INSTAGRAM_STORY");
                  const platInfo = PLATFORMS.find((p) => p.value === job.platform);
                  const Icon = platInfo?.icon ?? Send;
                  const permalink = getPlatformPermalink(job.platform, job.platformPostId, job.errorLog);

                  return (
                    <div
                      key={job.id}
                      className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-[var(--surface-hover)]">
                          <Icon className="size-4 text-foreground" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">
                              {isStory ? "Instagram Story" : platInfo?.label ?? job.platform}
                            </span>
                            {job.status === "DONE" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="size-3" /> Published
                              </span>
                            )}
                            {job.status === "FAILED" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
                                <XCircle className="size-3" /> Failed
                              </span>
                            )}
                            {job.status === "QUEUED" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                <Clock className="size-3" /> Scheduled ({getScheduledCountdown(job.scheduledFor)})
                              </span>
                            )}
                            {job.status === "PROCESSING" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                                <Loader2 className="size-3 animate-spin" />
                                <span className="animate-pulse">Publishing…</span>
                              </span>
                            )}
                          </div>
                          {job.publishedAt && (
                            <p className="text-xs text-[var(--ink3)]">
                              Published {formatDistanceToNow(new Date(job.publishedAt), { addSuffix: true })}
                            </p>
                          )}
                          {job.status === "FAILED" && job.errorLog && (
                            <PublishingActivityError
                              errorLog={job.errorLog}
                              platform={job.platform}
                              clientId={post.clientId}
                              postId={post.id}
                            />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {job.status === "DONE" && permalink && (
                          <a
                            href={permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-border bg-[var(--surface-hover)] px-2.5 py-1 text-xs font-medium text-primary hover:underline"
                          >
                            View Live <ExternalLink className="size-3" />
                          </a>
                        )}
                        {isStory && (job.status === "QUEUED" || job.status === "FAILED") && (
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 gap-1 text-xs"
                            onClick={handleFireStoryNow}
                            disabled={firingStory}
                          >
                            {firingStory ? <Loader2 className="size-3 animate-spin" /> : <Zap className="size-3" />}
                            Publish Story Immediately
                          </Button>
                        )}
                        {job.status === "FAILED" && !isStory && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={handleConfirmPublish}
                            disabled={publishing}
                          >
                            Retry Publish
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}

          <Panel
            title="Assets"
            headerAction={
              <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
                <DialogTrigger
                  render={
                    <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-[var(--ink3)] hover:text-foreground">
                      <Library className="size-3.5" /> Library ({unattached.length})
                    </Button>
                  }
                />
                <DialogContent className="max-w-2xl">
                  <DialogHeader><DialogTitle>Attach from library</DialogTitle></DialogHeader>
                  {unattached.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nothing available — upload below or add media in the client library.
                    </p>
                  ) : (
                    <div className="grid max-h-96 grid-cols-4 gap-2.5 overflow-y-auto sm:grid-cols-6 p-1">
                      {unattached.map((asset) => {
                        const thumb = asset.variants.find((v) => v.kind === "THUMBNAIL");
                        const isVid =
                          asset.originalKind === "VIDEO" ||
                          asset.originalUrl.endsWith(".mp4") ||
                          asset.originalUrl.endsWith(".mov");
                        const filename = decodeURIComponent(asset.originalUrl.split("/").pop() ?? "Media");
                        return (
                          <div
                            key={asset.id}
                            className="group relative aspect-square overflow-hidden rounded-lg border border-border hover:ring-2 hover:ring-primary transition"
                            title={filename}
                          >
                            <button
                              type="button"
                              onClick={() => handleAttach(asset.id)}
                              className="size-full block relative text-left"
                              title={`Attach ${filename}`}
                            >
                              {!isVid ? (
                                <Image src={thumb?.url ?? asset.originalUrl} alt={filename} fill className="object-cover" unoptimized />
                              ) : (
                                <video src={getVideoPlayUrl(asset.originalUrl)} className="size-full object-cover" muted playsInline />
                              )}
                              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition text-white">
                                <Plus className="size-5" />
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteLibraryAsset(asset.id, e)}
                              className="absolute right-1 top-1 z-10 flex size-6 items-center justify-center rounded bg-black/60 text-white opacity-0 transition group-hover:opacity-100 hover:bg-red-600 hover:text-white"
                              title="Delete asset"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            }
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="flex flex-wrap gap-3">
              {post.assets.map((pa) => {
                const thumb = pa.mediaAsset.variants.find((v) => v.kind === "THUMBNAIL");
                const isVideo =
                  pa.mediaAsset.originalKind === "VIDEO" ||
                  pa.mediaAsset.mimeType?.startsWith("video/") ||
                  pa.mediaAsset.originalUrl?.endsWith(".mp4") ||
                  pa.mediaAsset.originalUrl?.endsWith(".mov");
                const classification = classifyYouTubeVideo(pa.mediaAsset);
                return (
                  <div key={pa.id} className="group relative size-24 overflow-hidden rounded-xl border border-border bg-[var(--fill)]">
                    {!isVideo ? (
                      <Image
                        src={thumb?.url ?? pa.mediaAsset.originalUrl}
                        alt=""
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <>
                        <video src={getVideoPlayUrl(pa.mediaAsset.originalUrl)} className="size-full object-cover" muted playsInline />
                        {classification.isShort ? (
                          <span className="absolute bottom-1 left-1 pointer-events-none rounded bg-red-600/90 px-1.5 py-0.5 text-[9px] font-semibold text-white flex items-center gap-1 shadow-sm">
                            ▶ YouTube Short (9:16)
                          </span>
                        ) : (
                          <span className="absolute bottom-1 left-1 pointer-events-none rounded bg-slate-700 px-1.5 py-0.5 text-[9px] font-semibold text-white flex items-center gap-1 shadow-sm">
                            ▶ YouTube Video
                          </span>
                        )}
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDetach(pa.mediaAssetId)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
                      title="Detach"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex size-24 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-xs text-[var(--ink3)] hover:border-foreground hover:text-foreground disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 className="size-4 animate-spin text-primary" />
                    <span>Uploading…</span>
                  </>
                ) : (
                  <>
                    <Plus className="size-4" />
                    <span>Upload</span>
                  </>
                )}
              </button>
            </div>
          </Panel>

          <Panel title="Copy">
            <div className="space-y-4">
              {platforms.includes("YOUTUBE") && post.assets.some((pa) => {
                const isVid =
                  pa.mediaAsset.originalKind === "VIDEO" ||
                  pa.mediaAsset.mimeType?.startsWith("video/") ||
                  pa.mediaAsset.originalUrl?.endsWith(".mp4") ||
                  pa.mediaAsset.originalUrl?.endsWith(".mov");
                return isVid && classifyYouTubeVideo(pa.mediaAsset).isShort;
              }) && (
                <div className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-600 dark:text-red-400">
                  <span className="font-semibold">▶ YouTube Short detected:</span>
                  <span>Will publish with <span className="font-mono font-bold">#Shorts</span> appended to title and description.</span>
                </div>
              )}

              {/* Per-Platform Toggle */}
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isCustomPerPlatform}
                  onChange={(e) => setIsCustomPerPlatform(e.target.checked)}
                  className="size-4 rounded border-border"
                />
                <span>Customize caption per platform</span>
              </label>

              {!isCustomPerPlatform ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label>Caption</Label>
                    {platforms.includes("TWITTER") && (
                      <span className={`text-xs font-mono ${caption.length > 280 ? "text-red-600 font-bold" : "text-[var(--ink3)]"}`}>
                        {caption.length} / 280
                      </span>
                    )}
                  </div>
                  <Textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    rows={4}
                    placeholder="Post copy…"
                  />
                  {platforms.includes("TWITTER") && caption.length > 280 && (
                    <p className="mt-1 text-xs text-red-600 font-medium">
                      Twitter copy exceeds 280 character limit ({caption.length}/280).
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5 border-b border-border pb-2">
                    {platforms.length === 0 ? (
                      <span className="text-xs text-[var(--ink3)]">
                        Select platforms in the panel above to customize copy per channel.
                      </span>
                    ) : (
                      platforms.map((p) => {
                        const plat = PLATFORMS.find((x) => x.value === p);
                        const Icon = plat?.icon;
                        const isActive = activePlatformTab === p;
                        const platText = p === "YOUTUBE" ? (platformCaptions.YOUTUBE ?? "") : (platformCaptions[p] ?? "");
                        const isOverLimit = p === "TWITTER" && platText.length > 280;
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setActivePlatformTab(p)}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                              isActive
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "bg-[var(--surface-hover)] text-foreground hover:bg-border"
                            }`}
                          >
                            {Icon && <Icon className="size-3.5" />}
                            <span>{plat?.label ?? p}</span>
                            {isOverLimit && (
                              <span className="ml-1 rounded-full bg-red-600 px-1.5 py-0.2 text-[10px] text-white font-bold">
                                !
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Tab content */}
                  {activePlatformTab === "YOUTUBE" ? (
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <Label>YouTube Video Title</Label>
                          <span className={`text-xs font-mono ${(platformCaptions.YOUTUBE_TITLE?.length ?? 0) > 100 ? "text-red-600 font-bold" : "text-[var(--ink3)]"}`}>
                            {(platformCaptions.YOUTUBE_TITLE?.length ?? 0)} / 100
                          </span>
                        </div>
                        <Input
                          value={platformCaptions.YOUTUBE_TITLE ?? ""}
                          onChange={(e) =>
                            setPlatformCaptions((prev) => ({ ...prev, YOUTUBE_TITLE: e.target.value }))
                          }
                          maxLength={100}
                          placeholder="YouTube video title…"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <Label>YouTube Description</Label>
                          <span className={`text-xs font-mono ${(platformCaptions.YOUTUBE?.length ?? 0) > 5000 ? "text-red-600 font-bold" : "text-[var(--ink3)]"}`}>
                            {(platformCaptions.YOUTUBE?.length ?? 0)} / 5000
                          </span>
                        </div>
                        <Textarea
                          value={platformCaptions.YOUTUBE ?? ""}
                          onChange={(e) =>
                            setPlatformCaptions((prev) => ({ ...prev, YOUTUBE: e.target.value }))
                          }
                          rows={5}
                          placeholder="YouTube video description…"
                        />
                      </div>
                    </div>
                  ) : activePlatformTab === "TWITTER" ? (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label>X / Twitter Copy</Label>
                        <span className={`text-xs font-mono ${(platformCaptions.TWITTER?.length ?? 0) > 280 ? "text-red-600 font-bold" : "text-[var(--ink3)]"}`}>
                          {(platformCaptions.TWITTER?.length ?? 0)} / 280
                        </span>
                      </div>
                      <Textarea
                        value={platformCaptions.TWITTER ?? ""}
                        onChange={(e) =>
                          setPlatformCaptions((prev) => ({ ...prev, TWITTER: e.target.value }))
                        }
                        rows={4}
                        placeholder="What is happening?! (Max 280 chars)"
                      />
                      {(platformCaptions.TWITTER?.length ?? 0) > 280 && (
                        <p className="mt-1 text-xs text-red-600 font-medium">
                          Tweet text exceeds 280 character limit ({(platformCaptions.TWITTER?.length ?? 0)}/280).
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label>
                          {PLATFORMS.find((x) => x.value === activePlatformTab)?.label ?? activePlatformTab} Caption
                        </Label>
                      </div>
                      <Textarea
                        value={platformCaptions[activePlatformTab] ?? ""}
                        onChange={(e) =>
                          setPlatformCaptions((prev) => ({ ...prev, [activePlatformTab]: e.target.value }))
                        }
                        rows={4}
                        placeholder={`${PLATFORMS.find((x) => x.value === activePlatformTab)?.label ?? activePlatformTab} copy…`}
                      />
                    </div>
                  )}
                </div>
              )}
              <div>
                <Label>Hashtags (comma-separated)</Label>
                <Input
                  value={hashtagsRaw}
                  onChange={(e) => setHashtagsRaw(e.target.value)}
                  placeholder="launch, product, update"
                />
              </div>
              <div>
                <Label>Collaborators (comma-separated, max 3)</Label>
                <Input
                  value={collaboratorsRaw}
                  onChange={(e) => setCollaboratorsRaw(e.target.value)}
                  placeholder="brandpartner, influencer"
                />
              </div>

              {/* First-Comment Publishing Engine */}
              <div className="pt-2 border-t border-border space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={firstCommentEnabled}
                    onChange={(e) => setFirstCommentEnabled(e.target.checked)}
                    className="size-4 rounded border-border"
                  />
                  <span>Add First Comment (Instagram &amp; LinkedIn)</span>
                </label>
                {firstCommentEnabled && (
                  <div className="mt-2 space-y-1.5 pl-6">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Auto-published immediately after post goes live. Ideal for hashtag dump or outbound links.</span>
                      <span className="font-mono">{firstComment.length} / 2200</span>
                    </div>
                    <Textarea
                      value={firstComment}
                      onChange={(e) => setFirstComment(e.target.value)}
                      rows={3}
                      placeholder="First comment copy, extra hashtags (#tag1 #tag2), or links..."
                      maxLength={2200}
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          {/* Right-Side "Connected Accounts" Card: Positioned strictly above Details */}
          <Panel title={`Connected Accounts · ${post.client.name}`}>
            {oauthWarning && oauthWarning.platform === "facebook" && (
              <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-semibold text-amber-800 dark:text-amber-300">
                    Facebook Page Required
                  </p>
                  <p className="text-[11px] leading-relaxed text-amber-700/90 dark:text-amber-400/90">
                    {oauthWarning.message}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOauthWarning(null)}
                  className="text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200"
                  aria-label="Dismiss warning"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}
            <div className="space-y-2.5">
              {PLATFORMS.map(({ value, label, icon: Icon }) => {
                const connected = socialAccounts.find(
                  (a) => a.platform === value && a.connectionStatus === "CONNECTED",
                );
                const cleanHandle = connected?.accountName
                  ? `@${connected.accountName.replace(/^@+/, "")}`
                  : "";

                if (connected) {
                  return (
                    <div
                      key={value}
                      className="flex items-center justify-between gap-2 rounded-xl border border-border p-2.5 bg-background shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-hover)] border border-border">
                          {connected.avatarUrl ? (
                            <Image
                              src={connected.avatarUrl}
                              alt=""
                              width={28}
                              height={28}
                              className="size-full rounded-lg object-cover"
                              unoptimized
                            />
                          ) : (
                            <Icon className="size-3.5 text-foreground" />
                          )}
                          <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-background" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate text-foreground leading-tight">
                            {cleanHandle || label}
                          </p>
                          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                            Connected
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <a
                          href={`/api/oauth/${value.toLowerCase()}/init?clientId=${post.clientId}&returnTo=/posts/${post.id}`}
                          onClick={() => setOauthWarning(null)}
                          className="inline-flex h-6 items-center justify-center rounded px-1.5 text-[11px] font-medium text-[var(--ink3)] hover:text-foreground hover:bg-[var(--surface-hover)] transition-colors"
                          title={`Switch ${label} account`}
                        >
                          Switch
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDisconnectAccount(connected.id, label)}
                          disabled={disconnectingId === connected.id}
                          className="inline-flex h-6 items-center justify-center rounded px-1.5 text-[11px] font-medium text-red-500 hover:text-red-600 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                          title={`Disconnect ${label}`}
                        >
                          {disconnectingId === connected.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            "Disconnect"
                          )}
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={value}
                    className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-border/80 p-2.5 bg-muted/20"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-[var(--ink3)]">
                        <Icon className="size-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground leading-tight">{label}</p>
                        <p className="text-[10px] text-[var(--ink3)]">Not connected</p>
                      </div>
                    </div>
                    <a
                      href={`/api/oauth/${value.toLowerCase()}/init?clientId=${post.clientId}&returnTo=/posts/${post.id}`}
                      onClick={() => setOauthWarning(null)}
                      className="inline-flex h-6 items-center justify-center rounded-md border border-border bg-background px-2 text-[11px] font-medium text-foreground hover:bg-[var(--surface-hover)] transition-colors shadow-2xs shrink-0"
                    >
                      Connect
                    </a>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Details">
            <div className="space-y-1.5">
              <Label>Campaign</Label>
              <Select
                items={{ none: "None", ...Object.fromEntries(campaigns.map((c) => [c.id, c.name])) }}
                value={post.campaignId ?? "none"}
                onValueChange={(v) => v && handleCampaign(v)}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
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
