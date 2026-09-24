import "dotenv/config";
import { randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import { auth } from "../lib/auth";

/**
 * Creates (or promotes) an admin account.
 *
 * Cadence has no public sign-up — the HTTP sign-up endpoint is refused in
 * app/api/auth/[...all]/route.ts — and the seed deliberately won't run in
 * production, because it creates eight accounts sharing a password that
 * is committed to the repository. So a fresh deployment has no way in
 * until someone runs this.
 *
 * It goes through Better Auth rather than writing the row directly, so
 * the password is hashed exactly the way sign-in expects. Inserting a
 * user by hand produces an account that can never log in.
 *
 *   ADMIN_NAME="Akmal Rahman" \
 *   ADMIN_EMAIL="akmal@eyelevelstudio.in" \
 *   npx tsx scripts/create-admin.ts
 *
 * Omit ADMIN_PASSWORD and a strong one is generated and printed once.
 * Pass one to choose your own; it must be at least 10 characters, which
 * is what lib/auth.ts enforces.
 */

const prisma = new PrismaClient();

async function main() {
  const name = process.env.ADMIN_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const provided = process.env.ADMIN_PASSWORD;

  if (!name || !email) {
    throw new Error("Set ADMIN_NAME and ADMIN_EMAIL.");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error(`"${email}" doesn't look like an email address.`);
  }
  if (provided && provided.length < 10) {
    throw new Error("ADMIN_PASSWORD must be at least 10 characters.");
  }

  // base64url: no shell-hostile characters to mangle when it's copied.
  const password = provided ?? randomBytes(18).toString("base64url");

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // Already there — promote rather than fail, so this is safe to re-run
    // and doubles as "make this person an admin".
    if (existing.role !== "ADMIN") {
      await prisma.user.update({ where: { id: existing.id }, data: { role: "ADMIN" } });
      console.log(`Promoted ${email} from ${existing.role} to ADMIN.`);
    }

    // The bootstrap password is printed exactly once and stored only as a
    // hash, so losing it used to mean deleting the account and starting
    // again. Supplying ADMIN_PASSWORD on an existing account resets it.
    if (provided) {
      await resetPassword(existing.id, provided);
      console.log(`Password reset for ${email}.`);
    } else if (existing.role === "ADMIN") {
      console.log(`${email} is already an admin. Nothing to do.`);
      console.log("To reset a forgotten password, re-run with ADMIN_PASSWORD set.");
    }
    return;
  }

  const result = await auth.api.signUpEmail({ body: { name, email, password } });
  await prisma.user.update({ where: { id: result.user.id }, data: { role: "ADMIN" } });

  await prisma.auditLog.create({
    data: {
      userId: result.user.id,
      action: "ADMIN_BOOTSTRAPPED",
      entityType: "User",
      entityId: result.user.id,
      metadata: { email },
    },
  });

  console.log("\nAdmin account created.\n");
  console.log(`  email:    ${email}`);
  if (provided) {
    console.log("  password: (the one you supplied)");
  } else {
    console.log(`  password: ${password}`);
    console.log("\nThis is shown once and is not stored anywhere in plain text.");
    console.log("Save it now, then change it after signing in.");
  }
  console.log("");
}

/**
 * Rewrites the credential row's password hash.
 *
 * Better Auth keeps the hash on the `account` table under the
 * "credential" provider, not on the user — so this has to go through
 * Better Auth's own hasher, or sign-in won't be able to verify it.
 */
async function resetPassword(userId: string, newPassword: string) {
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(newPassword);

  const credential = await prisma.account.findFirst({
    where: { userId, providerId: "credential" },
    select: { id: true },
  });

  if (credential) {
    await prisma.account.update({ where: { id: credential.id }, data: { password: hash } });
  } else {
    // A magic-link-only account (a client reviewer) has no credential row
    // at all; give it one so it can sign in with a password.
    await prisma.account.create({
      data: { userId, accountId: userId, providerId: "credential", password: hash },
    });
  }

  // Existing sessions were issued against the old password.
  await prisma.session.deleteMany({ where: { userId } });
}

main()
  .catch((err) => {
    console.error("\nFailed:", err instanceof Error ? err.message : err, "\n");
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
