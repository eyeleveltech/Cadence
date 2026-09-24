import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { withSentryConfig } from "@sentry/nextjs/config";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy.
 *
 * 'unsafe-inline' on styles is Tailwind and the inline styles the
 * component library sets; 'unsafe-eval' in script-src is only tolerated
 * in development, where Next's dev overlay needs it. connect-src has to
 * reach Sentry and PostHog, and img-src allows blob:/data: for the
 * upload previews. Uploaded media is served same-origin from
 * /api/media with its own restrictive headers.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.sentry.io https://*.posthog.com https://app.posthog.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // Only meaningful over HTTPS; harmless on a plain-HTTP dev origin.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Required for Dockerfile's multi-stage build — bundles only the
  // production dependency subset the app actually needs into .next/standalone.
  output: "standalone",

  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
    middlewareClientMaxBodySize: "500mb",
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

/**
 * Sentry's plugin wraps every page and route module through a build-time
 * loader. That is worth paying for in a production build and worth
 * nothing on localhost, where errors are already in the terminal — so
 * the dev server skips it. Set SENTRY_IN_DEV=1 to debug the integration
 * itself.
 */
export default function config(phase: string): NextConfig {
  const skipSentry =
    phase === PHASE_DEVELOPMENT_SERVER && process.env.SENTRY_IN_DEV !== "1";

  if (skipSentry) return nextConfig;

  return withSentryConfig(nextConfig, {
    silent: true,
    // Source map upload needs SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN —
    // unset until the Sentry project exists, so this stays a harmless no-op.
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
  });
}
