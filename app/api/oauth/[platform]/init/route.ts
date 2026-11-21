import { NextRequest } from "next/server";
import { GET as connectGet } from "../connect/route";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ platform: string }> }) {
  return connectGet(req, ctx);
}
