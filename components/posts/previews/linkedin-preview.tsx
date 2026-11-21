"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ThumbsUp,
  MessageSquare,
  Repeat,
  Send,
  MoreHorizontal,
  Globe,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { SocialPreviewProps } from "./types";

export function LinkedInPreview({
  caption,
  hashtags,
  firstComment,
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

  const isLong = (caption?.length ?? 0) > 240;
  const displayText = !expanded && isLong ? `${caption.slice(0, 240)}…` : caption;

  return (
    <div className="mx-auto w-full max-w-[520px] rounded-xl border border-border bg-card shadow-sm text-card-foreground overflow-hidden">
      {/* LinkedIn Author Header */}
      <div className="flex items-start justify-between p-3.5 pb-2">
        <div className="flex items-start gap-2.5">
          <div className="relative size-12 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
            {avatarUrl ? (
              <Image src={avatarUrl} alt={clientName} fill className="object-cover" unoptimized />
            ) : (
              <div className="flex size-full items-center justify-center bg-[#0a66c2] text-xs font-bold text-white">
                {clientName.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold hover:underline cursor-pointer">{clientName}</h3>
              <span className="text-[11px] text-muted-foreground">· 1st</span>
            </div>
            <p className="text-[11px] text-muted-foreground line-clamp-1">
              Social Media Strategy & Creative Production
            </p>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span>1h</span>
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
      <div className="px-3.5 pb-3 text-xs leading-relaxed whitespace-pre-wrap break-words">
        <span>{displayText || <span className="text-muted-foreground italic">Share an update…</span>}</span>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="ml-1 font-semibold text-muted-foreground hover:text-foreground hover:underline"
          >
            {expanded ? "see less" : "...see more"}
          </button>
        )}
        {formattedHashtags && (
          <p className="mt-1.5 font-semibold text-[#0a66c2] dark:text-sky-400 hover:underline cursor-pointer">
            {formattedHashtags}
          </p>
        )}
      </div>

      {/* Media Attachment */}
      {assets.length > 0 && (
        <div className="relative aspect-[16/9] w-full bg-black/80 overflow-hidden flex items-center justify-center border-y border-border/40">
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
              alt="LinkedIn media"
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
              <div className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-0.5 text-[10px] text-white">
                {activeSlide + 1} of {assets.length}
              </div>
            </>
          )}
        </div>
      )}

      {/* Engagement Counter */}
      <div className="mx-3.5 flex items-center justify-between border-b border-border/60 py-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="flex size-4 items-center justify-center rounded-full bg-[#0a66c2] text-[8px] text-white">
            👍
          </span>
          <span className="flex size-4 items-center justify-center rounded-full bg-emerald-600 text-[8px] text-white -ml-1">
            👏
          </span>
          <span className="flex size-4 items-center justify-center rounded-full bg-amber-500 text-[8px] text-white -ml-1">
            💡
          </span>
          <span>{liked ? 143 : 142}</span>
        </div>
        <div className="flex items-center gap-2">
          <span>16 comments</span>
          <span>·</span>
          <span>4 reposts</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-4 gap-1 px-1 py-1 text-xs font-semibold text-muted-foreground">
        <button
          type="button"
          onClick={() => setLiked((l) => !l)}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 hover:bg-muted/70 transition ${
            liked ? "text-[#0a66c2] dark:text-sky-400 font-bold" : ""
          }`}
        >
          <ThumbsUp className={`size-4 ${liked ? "fill-[#0a66c2] dark:fill-sky-400" : ""}`} />
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
          <Repeat className="size-4" />
          <span>Repost</span>
        </button>
        <button
          type="button"
          className="flex items-center justify-center gap-1.5 rounded-lg py-2 hover:bg-muted/70 transition"
        >
          <Send className="size-4" />
          <span>Send</span>
        </button>
      </div>

      {/* First-Comment Preview */}
      {firstComment && (
        <div className="border-t border-border/50 bg-muted/30 p-3">
          <div className="flex items-start gap-2.5">
            <div className="relative size-8 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
              {avatarUrl ? (
                <Image src={avatarUrl} alt={clientName} fill className="object-cover" unoptimized />
              ) : (
                <div className="flex size-full items-center justify-center bg-[#0a66c2] text-[10px] font-bold text-white">
                  {clientName.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1 rounded-xl bg-card p-2.5 text-xs border border-border/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-foreground">{clientName}</span>
                  <span className="rounded bg-[#0a66c2]/10 px-1 py-0.5 text-[9px] font-medium text-[#0a66c2] dark:text-sky-400">
                    Author
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">Just now</span>
              </div>
              <p className="mt-1 text-foreground whitespace-pre-wrap break-words leading-relaxed">
                {firstComment}
              </p>
              <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground font-semibold">
                <span className="hover:underline cursor-pointer">Like</span>
                <span>·</span>
                <span className="hover:underline cursor-pointer">Reply</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
