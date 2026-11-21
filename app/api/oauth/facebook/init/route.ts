import { NextResponse } from "next/server";
import { getOAuthRedirectUri } from "@/lib/social/oauth-utils";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const returnTo = searchParams.get("returnTo") || "/";

  const appId = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID;
  if (!appId) {
    return NextResponse.json({ error: "Missing META_APP_ID in environment" }, { status: 500 });
  }

  const redirectUri = getOAuthRedirectUri("facebook");

  // Required scopes for Facebook Page posting and engagement
  const defaultScopes = [
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "business_management",
    "public_profile",
  ];

  const configuredScopes = process.env.FACEBOOK_OAUTH_SCOPES
    ? process.env.FACEBOOK_OAUTH_SCOPES.split(",").map((s) => s.trim()).filter(Boolean)
    : defaultScopes;

  const scopes = configuredScopes.join(",");

  const state = Buffer.from(JSON.stringify({ clientId, returnTo, ts: Date.now() })).toString("base64url");

  const graphVersion = process.env.META_GRAPH_API_VERSION ?? "v22.0";
  const authUrl = new URL(`https://www.facebook.com/${graphVersion}/dialog/oauth`);
  authUrl.searchParams.set("client_id", appId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("auth_type", "rerequest");
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}
