"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { getReviewQueue } from "@/lib/actions/review";
import { addApprovalComment } from "@/lib/actions/posts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusChip } from "@/components/status-ring";
import { Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";

type Data = Awaited<ReturnType<typeof getReviewQueue>>;

export function ReviewQueue({ posts }: { posts: Data["posts"] }) {
  const router = useRouter();

  if (posts.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-[var(--ink3)]">
        Nothing waiting on you right now.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <ReviewCard key={post.id} post={post} onChanged={() => router.refresh()} />
      ))}
    </div>
  );
}

function ReviewCard({ post, onChanged }: { post: Data["posts"][number]; onChanged: () => void }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  async function act(type: "APPROVAL" | "REVISION_REQUEST" | "COMMENT") {
    setBusy(true);
    try {
      await addApprovalComment({
        postId: post.id,
        body: comment.trim() || (type === "APPROVAL" ? "Approved" : "Please revise"),
        type,
      });
      setComment("");
      toast.success(type === "APPROVAL" ? "Approved" : type === "REVISION_REQUEST" ? "Revision requested" : "Comment added");
      onChanged();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const preview = previewFor(post.assets[0]?.mediaAsset);

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="font-medium">{post.title}</p>
        <StatusChip status={post.status} />
      </div>

      {preview?.kind === "image" && (
        <div className="relative aspect-square w-full max-w-xs overflow-hidden rounded-xl border border-border">
          <Image src={preview.url} alt="" fill className="object-cover" unoptimized />
        </div>
      )}
      {preview?.kind === "video" && (
        <video
          src={preview.url}
          controls
          playsInline
          className="w-full max-w-xs rounded-xl border border-border"
        />
      )}

      {post.caption && <p className="whitespace-pre-wrap text-sm">{post.caption}</p>}

      {post.comments.length > 0 && (
        <div className="space-y-1.5 rounded-xl bg-[var(--fill)] p-3">
          {post.comments.map((c) => (
            <p key={c.id} className="text-xs text-[var(--ink2)]">
              <span className="font-medium text-foreground">{c.author.name}:</span> {c.body}
            </p>
          ))}
        </div>
      )}

      {post.status === "CLIENT_REVIEW" && (
        <>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Optional note…"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => act("APPROVAL")}>
              <Check className="size-3.5" /> Approve
            </Button>
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => act("REVISION_REQUEST")}>
              <RotateCcw className="size-3.5" /> Request changes
            </Button>
            <Button size="sm" variant="outline" disabled={busy || !comment.trim()} onClick={() => act("COMMENT")}>
              Comment
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The preview the client actually gets to look at before approving.
 *
 * This used to fall back from the FEED_JPEG variant to the MediaAsset
 * itself and then test for a `url` field — which a MediaAsset doesn't
 * have; its column is `originalUrl`. So anything without a generated
 * feed variant, every video included, rendered nothing at all and the
 * client was asked to sign off on a caption alone.
 */
function previewFor(
  asset: Data["posts"][number]["assets"][number]["mediaAsset"] | undefined,
): { kind: "image" | "video"; url: string } | null {
  if (!asset) return null;

  if (asset.originalKind === "VIDEO") {
    return { kind: "video", url: asset.originalUrl };
  }

  const variant =
    asset.variants.find((v) => v.kind === "FEED_JPEG") ??
    asset.variants.find((v) => v.kind === "THUMBNAIL");

  return { kind: "image", url: variant?.url ?? asset.originalUrl };
}
