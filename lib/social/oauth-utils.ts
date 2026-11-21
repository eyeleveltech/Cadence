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

/**
 * Safely resolves a public redirect URL by extracting strictly the pathname and search params
 * from returnTo and anchoring it to the public getBaseUrl().
 * This prevents leaking internal Docker container IDs or private HTTP host headers into browser redirects.
 */
export function getSafeRedirectUrl(
  pathOrUrl: string | null | undefined,
  fallbackPath: string = "/planner"
): URL {
  const publicBase = getBaseUrl();
  let target = (pathOrUrl || "").trim() || fallbackPath;

  // If pathOrUrl is an absolute URL (e.g. http://<container-id>:3000/posts/...), extract strictly pathname + search
  if (target.startsWith("http://") || target.startsWith("https://")) {
    try {
      const parsed = new URL(target);
      target = parsed.pathname + parsed.search;
    } catch {
      target = fallbackPath;
    }
  }

  // Strip hash fragments
  target = target.replace(/#.*$/, "");

  // Ensure leading slash
  if (!target.startsWith("/")) {
    target = `/${target}`;
  }

  return new URL(target, publicBase);
}
