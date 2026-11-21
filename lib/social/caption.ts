import type { Platform } from "@prisma/client";

export type CustomCaptions = {
  _custom: true;
  default?: string;
  INSTAGRAM?: string;
  FACEBOOK?: string;
  TWITTER?: string;
  LINKEDIN?: string;
  YOUTUBE?: string;
  YOUTUBE_TITLE?: string;
};

export function isCustomCaptions(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return raw.startsWith('{"_custom":true') || raw.startsWith('{"_custom": true');
}

export function parseCustomCaptions(raw: string | null | undefined): CustomCaptions | null {
  if (!isCustomCaptions(raw)) return null;
  try {
    const parsed = JSON.parse(raw!);
    if (parsed._custom) return parsed as CustomCaptions;
  } catch {}
  return null;
}

export function resolvePlatformCaption(
  raw: string | null | undefined,
  platform: Platform,
  defaultTitle?: string
): { caption: string; title?: string } {
  if (!raw) return { caption: "", title: defaultTitle };
  const custom = parseCustomCaptions(raw);
  if (custom) {
    const caption = custom[platform] ?? custom.default ?? "";
    const title = platform === "YOUTUBE" ? (custom.YOUTUBE_TITLE || defaultTitle) : defaultTitle;
    return { caption, title };
  }
  return { caption: raw, title: defaultTitle };
}
