"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ThumbsUp,
  MessageSquare,
  Share2,
  Globe,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { SocialPreviewProps } from "./types";

export function FacebookPreview({
  caption,
  hashtags,
  assets,
  clientName,
  avatarUrl,
}: SocialPreviewProps) {
  const [liked, setLiked] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);

  const formattedHashtags = hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
  const currentAsset = assets[activeSlide] ?? assets[0];
  const isVideo =
    currentAsset?.originalKind === "VIDEO" ||
    currentAsset?.mimeType?.startsWith("video/") ||
    currentAsset?.url?.endsWith(".mp4") ||
    currentAsset?.url?.endsWith(".mov");

  const isLong = (caption?.length ?? 0) > 220;
  const displayText = !expanded && isLong ? `${caption.slice(0, 220)}…` : caption;

  return (
    <div className="mx-auto w-full max-w-[500px] rounded-xl border border-border bg-card shadow-sm text-card-foreground overflow-hidden">
      {/* Facebook Page Header */}
      <div className="flex items-center justify-between p-3.5">
        <div className="flex items-center gap-2.5">
          <div className="relative size-10 overflow-hidden rounded-full border border-border bg-muted">
            {avatarUrl ? (
              <Image src={avatarUrl} alt={clientName} fill className="object-cover" unoptimized />
            ) : (
              <div className="flex size-full items-center justify-center bg-blue-600 text-xs font-bold text-white">
                {clientName.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold hover:underline cursor-pointer">{clientName}</h3>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span>Just now</span>
              <span>·</span>
              <Globe className="size-3 text-muted-foreground" />
            </div>
          </div>
        </div>
        <button type="button" className="text-muted-foreground hover:text-foreground">
          <MoreHorizontal className="size-5" />
        </button>
      </div>

      {/* Post Text */}
      <div className="px-3.5 pb-3 text-sm leading-relaxed whitespace-pre-wrap break-words">
        <span>{displayText || <span className="text-muted-foreground italic">Post update…</span>}</span>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="ml-1 font-semibold text-foreground hover:underline"
          >
            {expanded ? "See less" : "See more"}
          </button>
        )}
        {formattedHashtags && (
          <p className="mt-1 font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
            {formattedHashtags}
          </p>
        )}
      </div>

      {/* Media Rendering */}
      {assets.length > 0 && (
        <div className="relative aspect-[16/9] w-full bg-black/80 overflow-hidden flex items-center justify-center">
          {isVideo ? (
            <video
              src={currentAsset?.url}
              className="size-full object-cover"
              controls
              playsInline
            />
          ) : (
            <Image
              src={currentAsset?.url ?? ""}
              alt="Facebook media"
              fill
              className="object-cover"
              unoptimized
            />
          )}

          {assets.length > 1 && (
            <>
              {activeSlide > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveSlide((s) => s - 1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80 transition"
                >
                  <ChevronLeft className="size-4" />
                </button>
              )}
              {activeSlide < assets.length - 1 && (
                <button
                  type="button"
                  onClick={() => setActiveSlide((s) => s + 1)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80 transition"
                >
                  <ChevronRight className="size-4" />
                </button>
              )}
              <div className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white">
                {activeSlide + 1} / {assets.length}
              </div>
            </>
          )}
        </div>
      )}

      {/* Engagement Counts */}
      <div className="mx-3.5 flex items-center justify-between border-b border-border/60 py-2.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="flex size-4 items-center justify-center rounded-full bg-blue-600 text-[9px] text-white">
            👍
          </span>
          <span className="flex size-4 items-center justify-center rounded-full bg-rose-500 text-[9px] text-white -ml-1">
            ❤️
          </span>
          <span>{liked ? 49 : 48}</span>
        </div>
        <div className="flex items-center gap-3">
          <span>8 comments</span>
          <span>3 shares</span>
        </div>
      </div>

      {/* Action Bar */}
      <div className="grid grid-cols-3 gap-1 p-1 text-xs font-semibold text-muted-foreground">
        <button
          type="button"
          onClick={() => setLiked((l) => !l)}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 hover:bg-muted/70 transition ${
            liked ? "text-blue-600 dark:text-blue-400 font-bold" : ""
          }`}
        >
          <ThumbsUp className={`size-4 ${liked ? "fill-blue-600 dark:fill-blue-400" : ""}`} />
          <span>Like</span>
        </button>
        <button
          type="button"
          className="flex items-center justify-center gap-1.5 rounded-lg py-2 hover:bg-muted/70 transition"
        >
          <MessageSquare className="size-4" />
          <span>Comment</span>
        </button>
        <button
          type="button"
          className="flex items-center justify-center gap-1.5 rounded-lg py-2 hover:bg-muted/70 transition"
        >
          <Share2 className="size-4" />
          <span>Share</span>
        </button>
      </div>
    </div>
  );
}
