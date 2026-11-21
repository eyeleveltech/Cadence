import { NextResponse } from "next/server";
import { getOAuthRedirectUri } from "@/lib/social/oauth-utils";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const returnTo = searchParams.get("returnTo") || "/";

  const appId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID;
  if (!appId) {
    return NextResponse.json({ error: "Missing INSTAGRAM_APP_ID or META_APP_ID in environment" }, { status: 500 });
  }

  const redirectUri = getOAuthRedirectUri("instagram");

  // Scopes provisioned in Meta dashboard
  const scopes = [
    "instagram_basic",
    "instagram_content_publish",
    "business_management",
  ].join(",");

  const state = Buffer.from(JSON.stringify({ clientId, returnTo, ts: Date.now() })).toString("base64url");

  const authUrl = new URL("https://www.facebook.com/v22.0/dialog/oauth");
  authUrl.searchParams.set("client_id", appId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("extras", JSON.stringify({ setup: { channel: "IG_API_ONBOARDING" } }));

  return NextResponse.redirect(authUrl.toString());
}
