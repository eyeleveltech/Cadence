import { NextRequest } from "next/server";
import { handleOAuthCallback } from "@/lib/social/oauth-handler";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handleOAuthCallback("youtube", req);
}
