import "dotenv/config";
import { PrismaClient, type Role } from "@prisma/client";
import { auth } from "../lib/auth";
import { seedContent } from "./seed-content";

const prisma = new PrismaClient();

const TEAM: { name: string; email: string; role: Role }[] = [
  { name: "Akmal Rahman", email: "akmal@eyelevelstudio.in", role: "ADMIN" },
  { name: "Dilshad", email: "dilshad@eyelevelstudio.in", role: "MANAGER" },
  { name: "Janani", email: "janani@eyelevelstudio.in", role: "MANAGER" },
  { name: "Shyam", email: "shyam@eyelevelstudio.in", role: "WRITER" },
  { name: "Shakila", email: "shakila@eyelevelstudio.in", role: "WRITER" },
  { name: "Sneha", email: "sneha@eyelevelstudio.in", role: "DESIGNER" },
  { name: "Ramya", email: "ramya@eyelevelstudio.in", role: "DESIGNER" },
  { name: "Aditya", email: "aditya@eyelevelstudio.in", role: "DESIGNER" },
];

/**
 * Eight real staff accounts, one of them an ADMIN, all sharing a password
 * that is committed to this repository. That is fine on a laptop and
 * catastrophic anywhere else, and nothing used to stop `npm run db:seed`
 * from being pointed at a production DATABASE_URL. It now refuses.
 *
 * Override with SEED_PASSWORD for a shared dev box where the committed
 * one isn't good enough.
 */
const DEV_PASSWORD = process.env.SEED_PASSWORD ?? "cadence-dev-2026";

function assertNotProduction() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to seed with NODE_ENV=production — this creates known-password accounts, including an admin.",
    );
  }

  // The escape hatch covers a shared dev box on another host. It does
  // not cover NODE_ENV=production, above — nothing should.
  if (process.env.SEED_ALLOW_REMOTE) return;

  const url = process.env.DATABASE_URL ?? "";
  const host = url.match(/@([^/:]+)/)?.[1] ?? "";
  const localHosts = ["localhost", "127.0.0.1", "::1", "postgres", "host.docker.internal"];
  if (host && !localHosts.includes(host)) {
    throw new Error(
      `Refusing to seed a non-local database (${host}). Set SEED_ALLOW_REMOTE=1 if you really mean it.`,
    );
  }
}

const CLIENTS = [
  { name: "Right Hospitals", slug: "right-hospitals", toneOfVoice: "Warm, reassuring, plain-language healthcare communication." },
  { name: "Heaven's ELIX", slug: "heavens-elix", toneOfVoice: "Playful, wellness-forward, kombucha-brand energy." },
  { name: "TNPA", slug: "tnpa", toneOfVoice: "High-energy sports and event hype — TNPPL Season 2." },
  { name: "Da One Sports", slug: "da-one-sports", toneOfVoice: "Community-first, active-lifestyle, encouraging." },
];

async function main() {
  assertNotProduction();

  console.log("Seeding team members via Better Auth (so passwords hash correctly)...");
  const userIds: Record<string, string> = {};

  for (const member of TEAM) {
    const existing = await prisma.user.findUnique({ where: { email: member.email } });
    if (existing) {
      userIds[member.email] = existing.id;
      continue;
    }

    const result = await auth.api.signUpEmail({
      body: { name: member.name, email: member.email, password: DEV_PASSWORD },
    });
    await prisma.user.update({ where: { id: result.user.id }, data: { role: member.role } });
    userIds[member.email] = result.user.id;
    console.log(`  created ${member.name} (${member.role})`);
  }

  console.log("Seeding clients...");
  const clientIds: Record<string, string> = {};
  for (const c of CLIENTS) {
    const client = await prisma.client.upsert({
      where: { slug: c.slug },
      create: c,
      update: {},
    });
    clientIds[c.slug] = client.id;
    console.log(`  ${client.name}`);
  }

  console.log("Assigning team to clients...");
  const assignments: [string, string[]][] = [
    ["right-hospitals", ["dilshad@eyelevelstudio.in", "shyam@eyelevelstudio.in", "sneha@eyelevelstudio.in"]],
    ["heavens-elix", ["janani@eyelevelstudio.in", "shakila@eyelevelstudio.in", "ramya@eyelevelstudio.in"]],
    ["tnpa", ["dilshad@eyelevelstudio.in", "shyam@eyelevelstudio.in", "aditya@eyelevelstudio.in", "sneha@eyelevelstudio.in"]],
    ["da-one-sports", ["janani@eyelevelstudio.in", "shakila@eyelevelstudio.in", "ramya@eyelevelstudio.in"]],
  ];

  for (const [slug, emails] of assignments) {
    for (const email of emails) {
      await prisma.clientMember.upsert({
        where: { clientId_userId: { clientId: clientIds[slug], userId: userIds[email] } },
        create: { clientId: clientIds[slug], userId: userIds[email] },
        update: {},
      });
    }
  }

  await seedContent(prisma, clientIds, userIds);

  console.log("\nDone. Every team member's dev password is:", DEV_PASSWORD);
  console.log("Sign in at /login with any @eyelevelstudio.in address above.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
