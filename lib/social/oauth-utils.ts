export type OAuthPlatform = "facebook" | "twitter" | "linkedin" | "youtube" | "instagram";

/**
 * Returns the dynamic base URL for the application.
 * Respects BETTER_AUTH_URL or NEXTAUTH_URL in production; falls back to localhost in development.
 */
export function getBaseUrl(): string {
  const rawBase =
    process.env.BETTER_AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.NODE_ENV === "production"
      ? "https://cadence.theeyelevelstudio.com"
      : "http://localhost:3000");

  return rawBase.replace(/\/$/, "");
}

/**
 * Generates the centralized OAuth redirect URI for each supported platform.
 * Dynamically resolves the base URL to prevent hardcoded localhost redirects in production.
 */
export function getOAuthRedirectUri(platform: OAuthPlatform | string): string {
  const base = getBaseUrl();
  return `${base}/api/oauth/${platform}/callback`;
}
