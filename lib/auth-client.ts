import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

/**
 * No baseURL on purpose: the auth API is served from this very app, so
 * the current origin is always right. It used to read NEXT_PUBLIC_APP_URL
 * — a variable that appears in neither .env nor .env.example — and fall
 * back to http://localhost:3000, which meant that in production every
 * browser sign-in POSTed to the user's own machine.
 */
export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});

export const { signIn, signOut, signUp, useSession } = authClient;
