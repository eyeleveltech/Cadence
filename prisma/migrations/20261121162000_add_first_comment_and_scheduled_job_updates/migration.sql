-- AlterTable
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "firstComment" TEXT;

-- AlterTable
ALTER TABLE "ScheduledJob" ALTER COLUMN "socialAccountId" DROP NOT NULL;

-- DropForeignKey
ALTER TABLE "ScheduledJob" DROP CONSTRAINT IF EXISTS "ScheduledJob_socialAccountId_fkey";

-- AddForeignKey
ALTER TABLE "ScheduledJob" ADD CONSTRAINT "ScheduledJob_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropIndex
DROP INDEX IF EXISTS "SocialAccount_clientId_platform_externalAccountId_key";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SocialAccount_clientId_platform_key" ON "SocialAccount"("clientId", "platform");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialAccount_clientId_platform_idx" ON "SocialAccount"("clientId", "platform");
