import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getOAuthAdapter, isPlatformSlug } from "@/lib/social/oauth";
import { signOAuthState } from "@/lib/social/oauth-state";

export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  if (!isPlatformSlug(platform)) return new Response("Unknown platform", { status: 404 });

  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) return new Response("Missing clientId", { status: 400 });

  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL(`/login?next=/clients/${clientId}/settings`, request.url));
  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
    return NextResponse.redirect(new URL(`/clients/${clientId}/settings`, request.url));
  }

  // Don't start a platform round trip for a client that doesn't exist —
  // the callback would come back holding a token with nowhere to put it.
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) return new Response("Not found", { status: 404 });

  const adapter = getOAuthAdapter(platform);
  if (!adapter.isConfigured()) {
    return NextResponse.redirect(
      new URL(`/clients/${clientId}/settings?oauth_error=not_configured&platform=${platform}`, request.url),
    );
  }

  const state = signOAuthState(clientId, platform, session.session.id);
  const redirectUri = `${process.env.BETTER_AUTH_URL}/api/oauth/${platform}/callback`;
  return NextResponse.redirect(adapter.authorizeUrl(redirectUri, state));
}
