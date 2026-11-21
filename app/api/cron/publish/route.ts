import { NextResponse } from "next/server";
import { runPublishSweep } from "@/lib/scheduler/worker";

export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // allow in local dev if CRON_SECRET is not set

  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) return true;

  const { searchParams } = new URL(req.url);
  if (searchParams.get("secret") === cronSecret) return true;

  return false;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runPublishSweep();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sweep failed";
    console.error("[Cron Publish Error]:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runPublishSweep();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sweep failed";
    console.error("[Cron Publish Error]:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
