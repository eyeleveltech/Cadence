import posthog from "posthog-js";

let initialized = false;

/** No-op until NEXT_PUBLIC_POSTHOG_KEY is set — same pattern as every
 * other optional integration in this app. */
export function initPosthog() {
  if (initialized || typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com",
    capture_pageview: false, // captured manually on route change, see PosthogPageview
    person_profiles: "identified_only",
  });
  initialized = true;
}

export { posthog };
