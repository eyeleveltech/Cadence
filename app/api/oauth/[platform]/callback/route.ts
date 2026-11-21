import { NextRequest } from "next/server";
import { handleOAuthCallback } from "@/lib/social/oauth-handler";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  return handleOAuthCallback(platform, request);
}
