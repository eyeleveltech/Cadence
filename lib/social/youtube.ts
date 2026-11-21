/**
 * YouTube Shorts vs. Long Video Classification and Helpers
 */

export type YouTubeVideoClassification = {
  isShort: boolean;
  aspectRatio: string;
  badgeLabel: string;
};

/**
 * Classifies a video as a YouTube Short vs Long Video:
 * Criteria: Vertical/Square aspect ratio (height >= width) AND duration <= 180s (3 minutes).
 */
export function classifyYouTubeVideo(asset: {
  width?: number | null;
  height?: number | null;
  durationSecs?: number | null;
  originalUrl?: string;
}): YouTubeVideoClassification {
  const width = asset.width ?? 0;
  const height = asset.height ?? 0;
  const duration = asset.durationSecs ?? 0;

  // Vertical or square is 9:16 or 1:1
  const isVerticalOrSquare =
    height > 0 && width > 0
      ? height >= width
      : asset.originalUrl?.toLowerCase().includes("story") ||
        asset.originalUrl?.toLowerCase().includes("short") ||
        false;

  // Duration check: <= 180 seconds (3 mins)
  const isWithinDuration = duration > 0 ? duration <= 180 : true;

  const isShort = isVerticalOrSquare && isWithinDuration;
  const aspectRatio = isVerticalOrSquare ? "9:16" : "16:9";
  const badgeLabel = isShort ? "YouTube Short (9:16)" : "YouTube Video (16:9)";

  return { isShort, aspectRatio, badgeLabel };
}
