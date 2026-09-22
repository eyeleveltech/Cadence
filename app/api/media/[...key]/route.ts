import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authorized media delivery. Uploads live outside the web root now, so
 * this is the only way to read one — and it checks the caller can reach
 * the owning client first. Client reviewers count: the post in their
 * review queue has to render its image.
 *
 * Content types come from this table and nowhere near the uploaded
 * filename or the browser-declared MIME. Both are attacker-controlled,
 * and serving an uploaded .html back from our own origin would hand
 * someone a script running against live sessions. Anything unrecognised
 * is refused rather than guessed at.
 */
const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

const CUID = /^c[a-z0-9]{20,}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;

  // <clientId>/<assetId>/<file> — anything else isn't a key we wrote.
  if (!key || key.length !== 3) return new Response("Not found", { status: 404 });
  const [clientId, assetId, filename] = key;

  if (!CUID.test(clientId) || !CUID.test(assetId)) {
    return new Response("Not found", { status: 404 });
  }

  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[extension];
  if (!contentType) return new Response("Not found", { status: 404 });

  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  if (!(await canReadClientMedia(session.user.id, session.user.role, clientId))) {
    return new Response("Not found", { status: 404 });
  }

  // The asset row is the record of what we accepted; a key that doesn't
  // match one is either stale or made up.
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
    select: { clientId: true },
  });
  if (!asset || asset.clientId !== clientId) {
    return new Response("Not found", { status: 404 });
  }

  const body = await storage.read(`${clientId}/${assetId}/${filename}`);
  if (!body) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
      // Belt and braces: even with a known-good type, never let a
      // browser sniff its way to something executable.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
      // Keys are immutable, but the response is per-viewer — a shared
      // cache must not hold one client's creative for another's request.
      "Cache-Control": "private, max-age=300",
    },
  });
}

async function canReadClientMedia(userId: string, role: string, clientId: string) {
  if (role === "ADMIN" || role === "MANAGER") return true;

  const membership = await prisma.clientMember.findUnique({
    where: { clientId_userId: { clientId, userId } },
    select: { id: true },
  });
  return Boolean(membership);
}
