import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink } from "better-auth/plugins";
import { prisma } from "./prisma";
import { sendMagicLinkEmail } from "./email";

/**
 * Two sign-in paths by design:
 *  - Team members (admin/manager/writer/designer) use email + password.
 *  - Client reviewers use magic link only — no password to set up or
 *    forget, since they're occasional visitors, not daily users.
 * Role itself is a plain field on User, not Better Auth's own admin
 * plugin — our five roles are a business concept (who does what on a
 * client), not an auth-library concept, so authorization is enforced
 * with our own `requireRole` helper rather than a generic ACL plugin.
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  // Enabled so admins can provision accounts server-side (inviteTeamMember,
  // prisma/seed.ts) and so invited people can sign in. It is NOT open
  // registration: the public sign-up endpoint is refused in
  // app/api/auth/[...all]/route.ts, which blocks network requests without
  // breaking the server-side calls. disableSignUp here would break both.
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "WRITER",
        input: false, // never settable from the client — admin assigns roles server-side
      },
    },
  },
  plugins: [
    magicLink({
      expiresIn: 60 * 15, // 15 minutes
      // Only a pre-invited account can sign in — a client reviewer's
      // User row is created by an admin via inviteClientReviewer, not
      // by anyone who types an email into the login form. Without this,
      // any stranger could get themselves a WRITER-default account.
      disableSignUp: true,
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail(email, url);
      },
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh once a day of activity
  },
});

export type Session = typeof auth.$Infer.Session;
