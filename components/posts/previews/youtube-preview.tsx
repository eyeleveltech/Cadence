"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Share2,
  Repeat,
  Music,
  Play,
  Volume2,
  MoreVertical,
  CheckCircle,
} from "lucide-react";
import type { SocialPreviewProps } from "./types";
import { classifyYouTubeVideo } from "@/lib/social/youtube";

export function YouTubePreview({
  caption,
  hashtags,
  assets,
  clientName,
  avatarUrl,
  youtubeTitle,
}: SocialPreviewProps) {
  const currentAsset = assets[0];
  const classification = currentAsset ? classifyYouTubeVideo(currentAsset) : { isShort: false, reason: "" };

  const [mode, setMode] = useState<"shorts" | "classic">(
    classification.isShort ? "shorts" : "classic"
  );
  const [liked, setLiked] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  const title = youtubeTitle || (caption ? caption.split("\n")[0].slice(0, 95) : "New Video Release");
  const formattedHashtags = hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");

  const isVideo =
    currentAsset?.originalKind === "VIDEO" ||
    currentAsset?.mimeType?.startsWith("video/") ||
    currentAsset?.url?.endsWith(".mp4") ||
    currentAsset?.url?.endsWith(".mov");

  return (
    <div className="space-y-3">
      {/* View Mode Toggle Switch */}
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setMode("shorts")}
          className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
            mode === "shorts"
              ? "bg-red-600 text-white shadow-sm"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          ▶ YouTube Shorts (9:16)
        </button>
        <button
          type="button"
          onClick={() => setMode("classic")}
          className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
            mode === "classic"
              ? "bg-red-600 text-white shadow-sm"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          YouTube Video (16:9)
        </button>
      </div>

      {mode === "shorts" ? (
        /* YouTube Shorts 9:16 Mobile Interface */
        <div className="relative mx-auto aspect-[9/16] w-full max-w-[340px] overflow-hidden rounded-3xl border-4 border-neutral-800 bg-black text-white shadow-2xl">
          {/* Video / Background */}
          {currentAsset && isVideo ? (
            <video
              src={currentAsset.url}
              className="size-full object-cover"
              loop
              muted
              autoPlay
              playsInline
            />
          ) : currentAsset ? (
            <Image
              src={currentAsset.url}
              alt={title}
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex size-full flex-col items-center justify-center p-6 text-center text-neutral-400">
              <Play className="size-10 text-neutral-600 mb-2" />
              <p className="text-xs">No video asset attached</p>
            </div>
          )}

          {/* Top Gradient & Controls */}
          <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/30 to-transparent p-4">
            <span className="text-xs font-bold tracking-tight text-white flex items-center gap-1">
              <span className="text-red-500">▶</span> Shorts
            </span>
            <div className="flex items-center gap-3">
              <Volume2 className="size-4" />
              <MoreVertical className="size-4" />
            </div>
          </div>

          {/* Right Floating Actions Stack */}
          <div className="absolute bottom-16 right-3 flex flex-col items-center gap-4">
            <button
              type="button"
              onClick={() => setLiked((l) => !l)}
              className="flex flex-col items-center gap-1 group"
            >
              <div className={`rounded-full p-2.5 bg-black/50 backdrop-blur-sm group-hover:bg-black/70 transition ${liked ? "text-red-500" : "text-white"}`}>
                <ThumbsUp className={`size-5 ${liked ? "fill-red-500" : ""}`} />
              </div>
              <span className="text-[11px] font-semibold">{liked ? "14.1K" : "14K"}</span>
            </button>

            <button type="button" className="flex flex-col items-center gap-1 group">
              <div className="rounded-full p-2.5 bg-black/50 backdrop-blur-sm group-hover:bg-black/70 transition">
                <ThumbsDown className="size-5 text-white" />
              </div>
              <span className="text-[11px] font-semibold">Dislike</span>
            </button>

            <button type="button" className="flex flex-col items-center gap-1 group">
              <div className="rounded-full p-2.5 bg-black/50 backdrop-blur-sm group-hover:bg-black/70 transition">
                <MessageSquare className="size-5 text-white" />
              </div>
              <span className="text-[11px] font-semibold">342</span>
            </button>

            <button type="button" className="flex flex-col items-center gap-1 group">
              <div className="rounded-full p-2.5 bg-black/50 backdrop-blur-sm group-hover:bg-black/70 transition">
                <Share2 className="size-5 text-white" />
              </div>
              <span className="text-[11px] font-semibold">Share</span>
            </button>

            <button type="button" className="flex flex-col items-center gap-1 group">
              <div className="rounded-full p-2.5 bg-black/50 backdrop-blur-sm group-hover:bg-black/70 transition">
                <Repeat className="size-5 text-white" />
              </div>
              <span className="text-[11px] font-semibold">Remix</span>
            </button>

            {/* Spinning sound disc */}
            <div className="size-8 rounded-lg border-2 border-white/60 bg-neutral-900 overflow-hidden flex items-center justify-center animate-spin">
              <Music className="size-4 text-white" />
            </div>
          </div>

          {/* Bottom Video Details */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-4 pr-16 space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative size-7 shrink-0 overflow-hidden rounded-full border border-white/30">
                {avatarUrl ? (
                  <Image src={avatarUrl} alt={clientName} fill className="object-cover" unoptimized />
                ) : (
                  <div className="flex size-full items-center justify-center bg-red-600 text-[10px] font-bold">
                    {clientName.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <span className="text-xs font-semibold truncate">@{clientName.toLowerCase().replace(/\s+/g, "")}</span>
              <button
                type="button"
                onClick={() => setSubscribed((s) => !s)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase transition ${
                  subscribed ? "bg-neutral-800 text-neutral-300" : "bg-white text-black"
                }`}
              >
                {subscribed ? "Subscribed" : "Subscribe"}
              </button>
            </div>

            <p className="line-clamp-2 text-xs font-medium text-white/95 leading-relaxed">
              {title} {formattedHashtags && <span className="text-sky-300">{formattedHashtags}</span>}
            </p>

            <div className="flex items-center gap-1.5 text-[10px] text-white/80">
              <Music className="size-3" />
              <span className="truncate">Original audio · {clientName}</span>
            </div>
          </div>
        </div>
      ) : (
        /* Classic YouTube Video Interface */
        <div className="mx-auto w-full max-w-[560px] rounded-2xl border border-border bg-card shadow-sm text-card-foreground overflow-hidden">
          {/* 16:9 Video Player */}
          <div className="relative aspect-video w-full bg-black flex items-center justify-center">
            {currentAsset && isVideo ? (
              <video
                src={currentAsset.url}
                className="size-full object-cover"
                controls
                playsInline
              />
            ) : currentAsset ? (
              <div className="relative size-full">
                <Image
                  src={currentAsset.url}
                  alt={title}
                  fill
                  className="object-cover"
                  unoptimized
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <div className="flex size-14 items-center justify-center rounded-full bg-red-600/90 text-white shadow-lg">
                    <Play className="size-6 ml-0.5 fill-white" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-muted-foreground">
                <Play className="size-12 text-muted-foreground/60 mb-2" />
                <p className="text-xs">No video uploaded</p>
              </div>
            )}
            <div className="absolute bottom-2.5 right-2.5 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-mono text-white">
              04:18
            </div>
          </div>

          {/* Video Metadata & Channel Row */}
          <div className="p-4 space-y-3">
            <h2 className="text-base font-bold leading-snug line-clamp-2 text-foreground">
              {title}
            </h2>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2.5">
                <div className="relative size-9 overflow-hidden rounded-full border border-border bg-muted shrink-0">
                  {avatarUrl ? (
                    <Image src={avatarUrl} alt={clientName} fill className="object-cover" unoptimized />
                  ) : (
                    <div className="flex size-full items-center justify-center bg-red-600 text-xs font-bold text-white">
                      {clientName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-foreground">{clientName}</span>
                    <CheckCircle className="size-3 text-muted-foreground" />
                  </div>
                  <p className="text-[10px] text-muted-foreground">28.4K subscribers</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSubscribed((s) => !s)}
                  className={`ml-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                    subscribed
                      ? "bg-muted text-muted-foreground hover:bg-muted/80"
                      : "bg-foreground text-background hover:opacity-90"
                  }`}
                >
                  {subscribed ? "Subscribed" : "Subscribe"}
                </button>
              </div>

              {/* Engagement Pills */}
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-full bg-muted/70 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setLiked((l) => !l)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 hover:bg-muted rounded-l-full transition ${
                      liked ? "text-red-600 font-bold" : ""
                    }`}
                  >
                    <ThumbsUp className={`size-3.5 ${liked ? "fill-red-600" : ""}`} />
                    <span>{liked ? "1.4K" : "1.3K"}</span>
                  </button>
                  <div className="h-4 w-px bg-border" />
                  <button type="button" className="px-2.5 py-1.5 hover:bg-muted rounded-r-full">
                    <ThumbsDown className="size-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-full bg-muted/70 px-3 py-1.5 text-xs font-medium hover:bg-muted transition"
                >
                  <Share2 className="size-3.5" />
                  <span>Share</span>
                </button>
              </div>
            </div>

            {/* Description Box */}
            <div className="rounded-xl bg-muted/40 p-3 text-xs space-y-1 border border-border/50">
              <div className="font-semibold text-foreground flex items-center gap-2">
                <span>1,420 views</span>
                <span>·</span>
                <span>2 hours ago</span>
                {formattedHashtags && (
                  <span className="text-sky-600 dark:text-sky-400 font-normal">{formattedHashtags}</span>
                )}
              </div>
              <p className="text-muted-foreground whitespace-pre-wrap break-words leading-relaxed pt-1">
                {caption || "Video description copy..."}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
