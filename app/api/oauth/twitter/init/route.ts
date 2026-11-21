import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clientIdParam = searchParams.get("clientId");
  const returnTo = searchParams.get("returnTo") || "/posts";

  // 1. Generate PKCE Verifier & Challenge
  const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
  const codeChallenge = base64UrlEncode(
    crypto.createHash("sha256").update(codeVerifier).digest()
  );

  // 2. Generate State (pack returnTo and clientId inside state, NOT redirect_uri)
  const stateToken = base64UrlEncode(crypto.randomBytes(16));
  const statePayload = JSON.stringify({ token: stateToken, returnTo, clientId: clientIdParam });
  const encodedState = Buffer.from(statePayload).toString("base64url");

  // 3. Store PKCE verifier and state token in cookies
  const cookieStore = await cookies();
  cookieStore.set("twitter_oauth_verifier", codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });
  cookieStore.set("twitter_oauth_state", stateToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });

  const clientId =
    process.env.TWITTER_CLIENT_ID ||
    process.env.X_CLIENT_ID ||
    "QVN1YkNqRjBtVXU5V3BDTGlNTX2k6MTpjaQ";

  // CRITICAL: Must exactly match the registered callback without trailing slashes or dynamic query params
  const redirectUri =
    process.env.TWITTER_REDIRECT_URI ||
    "http://localhost:3000/api/oauth/twitter/callback";

  // 4. Exact standard scopes for X OAuth 2.0
  const scopes = ["tweet.read", "tweet.write", "users.read"].join(" ");

  // Build URL using twitter.com endpoint
  const authUrl = new URL("https://twitter.com/i/oauth2/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("state", encodedState);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  console.log("----------------------------------------------------");
  console.log("[X OAuth 2.0 Auth URL Generated]:");
  console.log(authUrl.toString());
  console.log("----------------------------------------------------");

  return NextResponse.redirect(authUrl.toString());
}
