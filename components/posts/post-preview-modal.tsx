"use client";

import { useState } from "react";
import type { Platform } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Instagram,
  Facebook,
  Linkedin,
  Youtube,
  Eye,
} from "lucide-react";
import { InstagramPreview } from "./previews/instagram-preview";
import { TwitterPreview } from "./previews/twitter-preview";
import { FacebookPreview } from "./previews/facebook-preview";
import { LinkedInPreview } from "./previews/linkedin-preview";
import { YouTubePreview } from "./previews/youtube-preview";
import type { PreviewAsset } from "./previews/types";

function XTwitterIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" className={className} {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 24.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const PLATFORM_CONFIG: {
  value: Platform | "TWITTER";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "INSTAGRAM", label: "Instagram", icon: Instagram },
  { value: "TWITTER", label: "X (Twitter)", icon: XTwitterIcon },
  { value: "FACEBOOK", label: "Facebook", icon: Facebook },
  { value: "LINKEDIN", label: "LinkedIn", icon: Linkedin },
  { value: "YOUTUBE", label: "YouTube", icon: Youtube },
];

export type PostPreviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPlatforms: (Platform | "TWITTER")[];
  clientName: string;
  caption: string;
  hashtags: string[];
  firstComment?: string | null;
  collaborators?: string[];
  assets: PreviewAsset[];
  socialAccounts?: Array<{
    platform: Platform | "TWITTER";
    accountName: string;
    avatarUrl: string | null;
  }>;
  youtubeTitle?: string;
  platformCaptions?: Record<string, string>;
  isCustomPerPlatform?: boolean;
};

export function PostPreviewModal({
  open,
  onOpenChange,
  selectedPlatforms,
  clientName,
  caption,
  hashtags,
  firstComment,
  collaborators = [],
  assets,
  socialAccounts = [],
  youtubeTitle,
  platformCaptions = {},
  isCustomPerPlatform = false,
}: PostPreviewModalProps) {
  // Available platforms: if selectedPlatforms has entries, use them; otherwise show all 5
  const availableTabs = selectedPlatforms.length > 0 ? selectedPlatforms : (["INSTAGRAM", "TWITTER", "FACEBOOK", "LINKEDIN", "YOUTUBE"] as (Platform | "TWITTER")[]);

  const [activePlatform, setActivePlatform] = useState<Platform | "TWITTER">(
    availableTabs[0] ?? "INSTAGRAM"
  );

  // If active platform isn't in available tabs, fallback to first
  const currentTab = availableTabs.includes(activePlatform) ? activePlatform : (availableTabs[0] ?? "INSTAGRAM");

  // Resolve platform-specific copy if customized
  const currentCaption = isCustomPerPlatform
    ? (platformCaptions[currentTab] ?? caption)
    : caption;

  const currentYoutubeTitle = isCustomPerPlatform
    ? (platformCaptions.YOUTUBE_TITLE ?? youtubeTitle)
    : youtubeTitle;

  const connectedAccount = socialAccounts.find((a) => a.platform === currentTab);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0 overflow-hidden">
        {/* Header with Title and Platform Tabs */}
        <DialogHeader className="p-4 pb-3 border-b border-border bg-card">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Eye className="size-4 text-primary" /> Live Social Feed Preview
            </DialogTitle>
          </div>

          {/* Platform Tab Switcher */}
          <div className="flex flex-wrap gap-1.5 pt-2">
            {availableTabs.map((p) => {
              const conf = PLATFORM_CONFIG.find((x) => x.value === p);
              const Icon = conf?.icon;
              const isActive = currentTab === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setActivePlatform(p)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {Icon && <Icon className="size-3.5" />}
                  <span>{conf?.label ?? p}</span>
                </button>
              );
            })}
          </div>
        </DialogHeader>

        {/* Scrollable Preview Canvas */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-muted/20">
          {currentTab === "INSTAGRAM" && (
            <InstagramPreview
              platform="INSTAGRAM"
              caption={currentCaption}
              hashtags={hashtags}
              firstComment={firstComment}
              collaborators={collaborators}
              assets={assets}
              clientName={clientName}
              accountName={connectedAccount?.accountName}
              avatarUrl={connectedAccount?.avatarUrl}
            />
          )}

          {currentTab === "TWITTER" && (
            <TwitterPreview
              platform="TWITTER"
              caption={currentCaption}
              hashtags={hashtags}
              assets={assets}
              clientName={clientName}
              accountName={connectedAccount?.accountName}
              avatarUrl={connectedAccount?.avatarUrl}
            />
          )}

          {currentTab === "FACEBOOK" && (
            <FacebookPreview
              platform="FACEBOOK"
              caption={currentCaption}
              hashtags={hashtags}
              assets={assets}
              clientName={clientName}
              accountName={connectedAccount?.accountName}
              avatarUrl={connectedAccount?.avatarUrl}
            />
          )}

          {currentTab === "LINKEDIN" && (
            <LinkedInPreview
              platform="LINKEDIN"
              caption={currentCaption}
              hashtags={hashtags}
              firstComment={firstComment}
              assets={assets}
              clientName={clientName}
              accountName={connectedAccount?.accountName}
              avatarUrl={connectedAccount?.avatarUrl}
            />
          )}

          {currentTab === "YOUTUBE" && (
            <YouTubePreview
              platform="YOUTUBE"
              caption={currentCaption}
              hashtags={hashtags}
              assets={assets}
              clientName={clientName}
              accountName={connectedAccount?.accountName}
              avatarUrl={connectedAccount?.avatarUrl}
              youtubeTitle={currentYoutubeTitle}
            />
          )}
        </div>

        {/* Footer info pill */}
        <div className="border-t border-border px-4 py-2 bg-card text-[11px] text-muted-foreground flex items-center justify-between">
          <span>
            Previewing as <strong className="text-foreground">{connectedAccount?.accountName ?? clientName}</strong>
          </span>
          <span className="text-[10px]">Pixel-accurate platform simulation</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
