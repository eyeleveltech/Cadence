"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong.</p>
            <p style={{ fontSize: 14, color: "#666" }}>The team&apos;s been notified — try refreshing.</p>
          </div>
        </div>
      </body>
    </html>
  );
}
