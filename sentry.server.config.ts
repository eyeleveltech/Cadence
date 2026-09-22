import * as Sentry from "@sentry/nextjs";

// No-op without a DSN — same pattern as lib/email.ts: real integration,
// safe to run with nothing configured yet.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.2,
    environment: process.env.NODE_ENV,
  });
}
