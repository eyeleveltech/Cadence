import { NextResponse } from "next/server";
import { publishPostNow } from "@/lib/actions/posts";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  try {
    const { postId } = await params;
    const result = await publishPostNow(postId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publishing failed";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
