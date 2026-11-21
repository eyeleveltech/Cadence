"use client";

import { useState } from "react";
import Image from "next/image";
import {
  MessageCircle,
  Repeat,
  Heart,
  BarChart2,
  Bookmark,
  Share,
  MoreHorizontal,
} from "lucide-react";
import type { SocialPreviewProps } from "./types";

function TwitterVerifiedBadge() {
  return (
    <svg viewBox="0 0 22 22" aria-label="Verified account" className="size-4 text-sky-500 fill-current shrink-0">
      <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.136 2.136 5.485-5.485 1.302 1.292-6.787 6.787z" />
    </svg>
  );
}

export function TwitterPreview({
  caption,
  hashtags,
  assets,
  clientName,
  accountName,
  avatarUrl,
}: SocialPreviewProps) {
  const [liked, setLiked] = useState(false);
  const [retweeted, setRetweeted] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  const cleanHandle = accountName
    ? accountName.replace(/^@+/, "")
    : clientName.toLowerCase().replace(/[^a-z0-9_]/g, "");

  const displayName = clientName || "Cadence";
  const formattedHashtags = hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");

  return (
    <div className="mx-auto w-full max-w-[520px] rounded-2xl border border-border bg-card p-4 shadow-sm text-card-foreground">
      <div className="flex gap-3">
        {/* User Avatar */}
        <div className="relative size-10 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
          {avatarUrl ? (
            <Image src={avatarUrl} alt={displayName} fill className="object-cover" unoptimized />
          ) : (
            <div className="flex size-full items-center justify-center bg-primary/10 text-xs font-bold text-primary">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>

        {/* Tweet Content */}
        <div className="min-w-0 flex-1">
          {/* Header Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <span className="truncate text-sm font-bold text-foreground hover:underline cursor-pointer">
                {displayName}
              </span>
              <TwitterVerifiedBadge />
              <span className="truncate text-xs text-muted-foreground">@{cleanHandle}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground hover:underline cursor-pointer">now</span>
            </div>
            <button type="button" className="text-muted-foreground hover:text-foreground">
              <MoreHorizontal className="size-4" />
            </button>
          </div>

          {/* Tweet Text */}
          <div className="mt-1 text-[15px] leading-relaxed whitespace-pre-wrap break-words text-foreground">
            <span>{caption || <span className="text-muted-foreground italic">What is happening?!</span>}</span>
            {formattedHashtags && (
              <span className="ml-1 text-sky-500 hover:underline cursor-pointer font-normal">
                {formattedHashtags}
              </span>
            )}
          </div>

          {/* Attached Media Cards */}
          {assets.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-2xl border border-border/60 bg-muted/30">
              {assets.length === 1 ? (
                <div className="relative aspect-[16/9] w-full overflow-hidden bg-black/80">
                  {assets[0].originalKind === "VIDEO" || assets[0].mimeType?.startsWith("video/") ? (
                    <video
                      src={assets[0].url}
                      className="size-full object-cover"
                      controls
                      playsInline
                    />
                  ) : (
                    <Image
                      src={assets[0].url}
                      alt="Tweet attachment"
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1 bg-border/40 p-0.5">
                  {assets.slice(0, 4).map((asset, i) => (
                    <div key={asset.id} className="relative aspect-square overflow-hidden bg-black/60">
                      <Image
                        src={asset.url}
                        alt={`Attachment ${i + 1}`}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tweet Engagement Bar */}
          <div className="mt-3 flex items-center justify-between text-muted-foreground max-w-md pt-1">
            <button
              type="button"
              className="group flex items-center gap-1.5 text-xs hover:text-sky-500 transition"
            >
              <div className="rounded-full p-1.5 group-hover:bg-sky-500/10">
                <MessageCircle className="size-4" />
              </div>
              <span>12</span>
            </button>

            <button
              type="button"
              onClick={() => setRetweeted((r) => !r)}
              className={`group flex items-center gap-1.5 text-xs transition ${
                retweeted ? "text-emerald-500" : "hover:text-emerald-500"
              }`}
            >
              <div className="rounded-full p-1.5 group-hover:bg-emerald-500/10">
                <Repeat className="size-4" />
              </div>
              <span>{retweeted ? 6 : 5}</span>
            </button>

            <button
              type="button"
              onClick={() => setLiked((l) => !l)}
              className={`group flex items-center gap-1.5 text-xs transition ${
                liked ? "text-rose-500" : "hover:text-rose-500"
              }`}
            >
              <div className="rounded-full p-1.5 group-hover:bg-rose-500/10">
                <Heart className={`size-4 ${liked ? "fill-rose-500" : ""}`} />
              </div>
              <span>{liked ? 85 : 84}</span>
            </button>

            <button
              type="button"
              className="group flex items-center gap-1.5 text-xs hover:text-sky-500 transition"
            >
              <div className="rounded-full p-1.5 group-hover:bg-sky-500/10">
                <BarChart2 className="size-4" />
              </div>
              <span>1.4K</span>
            </button>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setBookmarked((b) => !b)}
                className={`rounded-full p-1.5 hover:text-sky-500 hover:bg-sky-500/10 transition ${
                  bookmarked ? "text-sky-500" : ""
                }`}
              >
                <Bookmark className={`size-4 ${bookmarked ? "fill-sky-500" : ""}`} />
              </button>
              <button
                type="button"
                className="rounded-full p-1.5 hover:text-sky-500 hover:bg-sky-500/10 transition"
              >
                <Share className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
