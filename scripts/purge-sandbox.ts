import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Checking for sandbox / mock social accounts and receipts...");

  const allAccounts = await prisma.socialAccount.findMany({
    select: { id: true, clientId: true, platform: true, accountName: true, externalAccountId: true },
  });

  console.log(`Found ${allAccounts.length} social account(s) in DB:`);
  for (const acc of allAccounts) {
    console.log(` - [${acc.platform}] id: ${acc.id}, client: ${acc.clientId}, name: "${acc.accountName}", ext: "${acc.externalAccountId}"`);
  }

  // Delete records matching Sandbox, @@EyeLevel_Instagram_Sandbox, or sim_
  const sandboxAccounts = await prisma.socialAccount.findMany({
    where: {
      OR: [
        { accountName: { contains: "Sandbox", mode: "insensitive" } },
        { accountName: { contains: "sim_", mode: "insensitive" } },
        { externalAccountId: { contains: "sandbox", mode: "insensitive" } },
        { externalAccountId: { contains: "sim_", mode: "insensitive" } },
        { accountName: { startsWith: "@@" } },
      ],
    },
  });

  if (sandboxAccounts.length > 0) {
    console.log(`Deleting ${sandboxAccounts.length} sandbox/mock account(s)...`);
    const ids = sandboxAccounts.map((a) => a.id);
    await prisma.scheduledJob.deleteMany({
      where: {
        OR: [
          { socialAccountId: { in: ids } },
          { idempotencyKey: { contains: "sim_" } },
          { platformPostId: { startsWith: "sim_" } },
        ],
      },
    });
    await prisma.socialAccount.deleteMany({
      where: { id: { in: ids } },
    });
    console.log("Deleted sandbox accounts and their scheduled jobs.");
  } else {
    console.log("No sandbox/mock social accounts found.");
  }

  // Also clean up any lingering ScheduledJobs with sim_ platformPostId or sim_ errorLog
  const deletedSimJobs = await prisma.scheduledJob.deleteMany({
    where: {
      OR: [
        { platformPostId: { startsWith: "sim_" } },
        { idempotencyKey: { contains: "sim_" } },
      ],
    },
  });
  if (deletedSimJobs.count > 0) {
    console.log(`Deleted ${deletedSimJobs.count} simulated ScheduledJob record(s).`);
  }

  console.log("Purge complete.");
}

main()
  .catch((err) => {
    console.error("Purge error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
