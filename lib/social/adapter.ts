// Shared with the standalone worker process — no "server-only" guard.
import type { Platform, SocialAccount } from "@prisma/client";

export type PublishInput = {
  caption: string;
  hashtags: string[];
  mediaUrls: string[];
  postAsStory: boolean;
  account: SocialAccount;
};

export type PublishResult = { externalId: string };

/**
 * One shape every platform publishes through. Nothing outside this file
 * (the worker included) should know how any individual platform's API
 * works — swapping a stub for the real Meta/LinkedIn/YouTube call is a
 * change contained entirely to that platform's adapter.
 */
export interface SocialAdapter {
  publish(input: PublishInput): Promise<PublishResult>;
}

/**
 * Every platform is behind this same wall right now: the OAuth apps
 * exist but haven't cleared review, so there's no access token to call
 * with. This throws instead of pretending to succeed — a job that fails
 * loudly here is correct; the shortcut of faking a publish isn't.
 */
function pendingAppReview(platform: string): SocialAdapter {
  return {
    async publish() {
      throw new Error(
        `${platform} publishing isn't live yet — waiting on app review/verification (see Settings → Connected Platform Accounts).`,
      );
    },
  };
}

const ADAPTERS: Record<Platform, SocialAdapter> = {
  INSTAGRAM: pendingAppReview("Instagram"),
  FACEBOOK: pendingAppReview("Facebook"),
  LINKEDIN: pendingAppReview("LinkedIn"),
  YOUTUBE: pendingAppReview("YouTube"),
};

export function getSocialAdapter(platform: Platform): SocialAdapter {
  return ADAPTERS[platform];
}
