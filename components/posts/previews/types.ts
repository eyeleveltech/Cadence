import type { Platform } from "@prisma/client";

export type PreviewAsset = {
  id: string;
  url: string;
  mimeType?: string | null;
  originalKind?: string | null;
  width?: number | null;
  height?: number | null;
  durationSecs?: number | null;
};

export type SocialPreviewProps = {
  platform: Platform;
  caption: string;
  hashtags: string[];
  firstComment?: string | null;
  collaborators?: string[];
  assets: PreviewAsset[];
  clientName: string;
  accountName?: string;
  avatarUrl?: string | null;
  youtubeTitle?: string;
  isDesktop?: boolean;
};
