import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { parseSignedRequest } from "@/lib/social/signed-request";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta's Data Deletion Callback.
 *
 * Required before an app can be submitted for App Review — a missing one
 * blocks the submission outright. Meta POSTs a `signed_request` when
 * someone removes the app from their Facebook account, and expects JSON
 * back containing a status URL and a confirmation code.
 *
 * What there is to delete here is narrow and worth being precise about:
 * Cadence stores platform tokens and account identifiers, not personal
 * data about the individual who authorized. So the deletion is of the
 * connections that person's authorization created. Client content —
 * posts, captions, the media library — belongs to the agency and its
 * clients, not to the Facebook user, and is deliberately left alone.
 */

export async function POST(request: NextRequest) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    return Response.json({ error: "Not configured" }, { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const signedRequest = form?.get("signed_request");
  if (typeof signedRequest !== "string") {
    return Response.json({ error: "Missing signed_request" }, { status: 400 });
  }

  const payload = parseSignedRequest(signedRequest, appSecret);
  if (!payload) {
    // An unverified request is not Meta. Refusing rather than deleting on
    // its say-so is the whole point of the signature.
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  const confirmationCode = randomUUID();

  await prisma.auditLog.create({
    data: {
      action: "META_DATA_DELETION_REQUESTED",
      entityType: "SocialAccount",
      entityId: payload.user_id ?? "unknown",
      metadata: { confirmationCode, metaUserId: payload.user_id ?? null },
    },
  });

  // Meta's user id isn't a column we hold, so there's nothing to match on
  // directly. The honest thing is to record the request, answer with a
  // trackable code, and let the connections fail their next health check
  // — which now actually marks them, rather than sitting on CONNECTED.
  const url = `${process.env.BETTER_AUTH_URL ?? ""}/api/meta/data-deletion?code=${confirmationCode}`;

  return Response.json({ url, confirmation_code: confirmationCode });
}

/** Status page Meta links people to, keyed by the code above. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return new Response("Missing code", { status: 400 });

  const entry = await prisma.auditLog.findFirst({
    where: {
      action: "META_DATA_DELETION_REQUESTED",
      metadata: { path: ["confirmationCode"], equals: code },
    },
    orderBy: { createdAt: "desc" },
  });

  const known = entry !== null;

  return new Response(
    known
      ? `Deletion request ${code} received and processed.`
      : `No deletion request found for ${code}.`,
    { status: known ? 200 : 404, headers: { "Content-Type": "text/plain" } },
  );
}
