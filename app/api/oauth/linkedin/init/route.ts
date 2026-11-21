import { NextRequest } from "next/server";
import { handleOAuthConnect } from "@/lib/social/oauth-handler";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handleOAuthConnect("linkedin", req);
}
