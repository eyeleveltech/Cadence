"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  User,
  Volume2,
} from "lucide-react";
import type { SocialPreviewProps } from "./types";

export function InstagramPreview({
  caption,
  hashtags,
  firstComment,
  collaborators = [],
  assets,
  clientName,
  accountName,
  avatarUrl,
}: SocialPreviewProps) {
  const [activeSlide, setActiveSlide] = useState(0);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showTags, setShowTags] = useState(false);

  const cleanHandle = accountName
    ? accountName.replace(/^@+/, "")
    : clientName.toLowerCase().replace(/[^a-z0-9_]/g, "_");

  const cleanCollabs = collaborators
    .map((c) => c.replace(/^@+/, "").trim())
    .filter(Boolean);

  const currentAsset = assets[activeSlide] ?? assets[0];
  const isVideo =
    currentAsset?.originalKind === "VIDEO" ||
    currentAsset?.mimeType?.startsWith("video/") ||
    currentAsset?.url?.endsWith(".mp4") ||
    currentAsset?.url?.endsWith(".mov");

  const formattedHashtags = hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");

  return (
    <div className="mx-auto w-full max-w-[420px] overflow-hidden rounded-2xl border border-border bg-card shadow-sm text-card-foreground">
      {/* Instagram Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-9 rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 p-[2px] shrink-0">
            <div className="relative size-full overflow-hidden rounded-full bg-background border border-background">
              {avatarUrl ? (
                <Image src={avatarUrl} alt={cleanHandle} fill className="object-cover" unoptimized />
              ) : (
                <div className="flex size-full items-center justify-center bg-primary/10 text-xs font-bold text-primary">
                  {cleanHandle.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="truncate text-xs font-semibold hover:underline cursor-pointer">
                {cleanHandle}
              </span>
              {cleanCollabs.length > 0 && (
                <span className="truncate text-[11px] text-muted-foreground">
                  and {cleanCollabs.map((c) => `@${c}`).join(", ")}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">Original audio</p>
          </div>
        </div>
        <button type="button" className="text-foreground/70 hover:text-foreground">
          <MoreHorizontal className="size-4" />
        </button>
      </div>

      {/* Media Viewport */}
      <div className="relative aspect-square w-full bg-black/90 overflow-hidden flex items-center justify-center">
        {assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
            <div className="size-12 rounded-full border border-dashed border-border flex items-center justify-center mb-2">
              <User className="size-6 text-muted-foreground" />
            </div>
            <p className="text-xs">No media attached</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Attach images or video in the editor</p>
          </div>
        ) : isVideo ? (
          <div className="relative size-full">
            <video
              src={currentAsset?.url}
              className="size-full object-cover"
              loop
              muted
              playsInline
              autoPlay
            />
            <div className="absolute bottom-2.5 right-2.5 rounded-full bg-black/60 p-1.5 text-white">
              <Volume2 className="size-3.5" />
            </div>
          </div>
        ) : (
          <Image
            src={currentAsset?.url ?? ""}
            alt="Instagram post media"
            fill
            className="object-cover"
            unoptimized
          />
        )}

        {/* Carousel slide indicators & buttons */}
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
            <div className="absolute top-2.5 right-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
              {activeSlide + 1}/{assets.length}
            </div>
          </>
        )}

        {/* Tagged user pill button */}
        {cleanCollabs.length > 0 && (
          <div className="absolute bottom-2.5 left-2.5">
            <button
              type="button"
              onClick={() => setShowTags((v) => !v)}
              className="flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-medium text-white shadow-sm backdrop-blur-sm hover:bg-black/90 transition"
            >
              <User className="size-3" />
              <span>{showTags ? "Hide tags" : `${cleanCollabs.length} tag${cleanCollabs.length > 1 ? "s" : ""}`}</span>
            </button>
            {showTags && (
              <div className="mt-1 flex flex-wrap gap-1">
                {cleanCollabs.map((collab) => (
                  <span
                    key={collab}
                    className="rounded bg-black/80 px-1.5 py-0.5 text-[10px] text-white shadow"
                  >
                    @{collab}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Bar */}
      <div className="px-3.5 pt-2.5 pb-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              onClick={() => setLiked((l) => !l)}
              className="transition hover:scale-110 active:scale-95"
            >
              <Heart
                className={`size-6 transition ${
                  liked ? "fill-rose-500 text-rose-500" : "text-foreground"
                }`}
              />
            </button>
            <button type="button" className="transition hover:scale-110 text-foreground">
              <MessageCircle className="size-6" />
            </button>
            <button type="button" className="transition hover:scale-110 text-foreground">
              <Send className="size-5" />
            </button>
          </div>

          {/* Carousel dots */}
          {assets.length > 1 && (
            <div className="flex items-center gap-1">
              {assets.map((_, i) => (
                <span
                  key={i}
                  className={`size-1.5 rounded-full transition ${
                    i === activeSlide ? "bg-primary scale-110" : "bg-muted-foreground/30"
                  }`}
                />
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setSaved((s) => !s)}
            className="transition hover:scale-110 text-foreground"
          >
            <Bookmark
              className={`size-6 transition ${
                saved ? "fill-foreground text-foreground" : "text-foreground"
              }`}
            />
          </button>
        </div>

        {/* Like count */}
        <p className="mt-2 text-xs font-semibold">
          {liked ? "1,249 likes" : "1,248 likes"}
        </p>

        {/* Caption & Hashtags */}
        <div className="mt-1 text-xs leading-relaxed break-words whitespace-pre-wrap">
          <span className="font-semibold mr-1.5">{cleanHandle}</span>
          <span>{caption || <span className="text-muted-foreground italic">No caption yet...</span>}</span>
          {formattedHashtags && (
            <span className="ml-1.5 text-sky-600 dark:text-sky-400 font-medium">
              {formattedHashtags}
            </span>
          )}
        </div>

        {/* First Comment Section */}
        {firstComment && (
          <div className="mt-2.5 rounded-lg border border-border/50 bg-muted/40 p-2 text-xs">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-1.5 min-w-0">
                <span className="font-semibold shrink-0">{cleanHandle}</span>
                <span className="text-muted-foreground/80 font-mono text-[10px] uppercase rounded bg-muted px-1 py-0.5">
                  1st comment
                </span>
                <span className="break-words whitespace-pre-wrap text-[11px] text-foreground">
                  {firstComment}
                </span>
              </div>
              <Heart className="size-3 text-muted-foreground shrink-0 mt-0.5" />
            </div>
          </div>
        )}

        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>View all 14 comments</span>
          <span className="uppercase text-[9px] tracking-wider">Just now</span>
        </div>
      </div>
    </div>
  );
}
