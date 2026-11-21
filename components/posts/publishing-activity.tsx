"use client";

import React from "react";
import Link from "next/link";
import { AlertCircle, RefreshCw } from "lucide-react";

type Platform = "INSTAGRAM" | "FACEBOOK" | "LINKEDIN" | "YOUTUBE" | "TWITTER";

interface PublishingErrorProps {
  errorLog: string;
  platform: Platform;
  clientId: string;
  postId: string;
  className?: string;
}

export type ParsedPublishingError = {
  isSessionExpired: boolean;
  isPermissionError: boolean;
  cleanMessage: string;
};

export function parsePublishingError(errorLog: string): ParsedPublishingError {
  let isSessionExpired = false;
  let isPermissionError = false;
  let cleanMessage = errorLog.trim();

  // Try extracting embedded JSON
  const jsonMatch = errorLog.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const errObj = parsed.error || parsed;

      const code = errObj.code || errObj.status_code;
      const subcode = errObj.error_subcode;
      const rawMsg = errObj.message || errObj.description || "";

      if (code === 190 || subcode === 460 || /session.*expired|invalid.*token/i.test(rawMsg)) {
        isSessionExpired = true;
      } else if (code === 200 || /permission/i.test(rawMsg)) {
        isPermissionError = true;
      }

      if (rawMsg) {
        cleanMessage = rawMsg;
      }
    } catch {
      // JSON parse failed, fallback to string checks
    }
  }

  // Regex fallbacks across full text
  if (!isSessionExpired && !isPermissionError) {
    if (/(["':\s]190[,\s}]|subcode[":\s]*460|session\s+(has\s+)?expired|invalid\s+refresh\s+token)/i.test(errorLog)) {
      isSessionExpired = true;
    } else if (/(["':\s]200[,\s}]|permissions?\s+error)/i.test(errorLog)) {
      isPermissionError = true;
    }
  }

  // Sanitize trace IDs and clean up message
  cleanMessage = cleanMessage
    .replace(/"?fbtrace_id"?\s*[:=]\s*"?[^"}\s,]+"?/gi, "")
    .replace(/\s*\(#\d+\)\s*/g, " ")
    .replace(/^\{.*error":\s*\{/i, "")
    .replace(/[{}"]/g, "")
    .trim();

  return {
    isSessionExpired,
    isPermissionError,
    cleanMessage: cleanMessage || errorLog,
  };
}

export function PublishingActivityError({
  errorLog,
  platform,
  clientId,
  postId,
  className = "",
}: PublishingErrorProps) {
  const { isSessionExpired, isPermissionError, cleanMessage } = parsePublishingError(errorLog);
  const reconnectUrl = `/api/oauth/${platform.toLowerCase()}/init?clientId=${clientId}&returnTo=/posts/${postId}`;

  if (isSessionExpired) {
    return (
      <div className={`mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-400 ${className}`}>
        <AlertCircle className="size-4 shrink-0 text-red-500" />
        <span className="font-medium">Session expired or revoked. Please reconnect your account.</span>
        <Link
          href={reconnectUrl}
          className="inline-flex h-6 items-center gap-1 rounded-md border border-red-400 px-2 text-[11px] font-medium text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950 transition-colors"
        >
          <RefreshCw className="size-3" /> Reconnect
        </Link>
      </div>
    );
  }

  if (isPermissionError) {
    return (
      <div className={`mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400 ${className}`}>
        <AlertCircle className="size-4 shrink-0 text-amber-500" />
        <span>Missing Page publishing permission. Please ensure you are an Admin of the connected page.</span>
        <Link
          href={reconnectUrl}
          className="inline-flex h-6 items-center gap-1 rounded-md border border-amber-400 px-2 text-[11px] font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950 transition-colors"
        >
          <RefreshCw className="size-3" /> Re-authorize
        </Link>
      </div>
    );
  }

  return (
    <div className={`mt-1 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400 ${className}`}>
      <AlertCircle className="size-3.5 shrink-0 mt-0.5 text-red-500" />
      <span className="break-words font-mono text-[11px]">{cleanMessage}</span>
    </div>
  );
}
