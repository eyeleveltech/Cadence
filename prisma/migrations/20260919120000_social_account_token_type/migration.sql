-- Distinguish a connection that expired (reconnect fixes it) from one
-- whose permission was withdrawn (only the client can fix it).
-- BEFORE 'REVOKED' keeps the DB order matching schema.prisma.
ALTER TYPE "ConnectionStatus" ADD VALUE 'PERMISSION_MISSING' BEFORE 'REVOKED';

-- What kind of credential accessToken holds. PAGE and SYSTEM_USER tokens
-- do not expire; USER tokens do.
CREATE TYPE "TokenType" AS ENUM ('USER', 'PAGE', 'SYSTEM_USER');

ALTER TABLE "SocialAccount"
  ADD COLUMN "avatarUrl" TEXT,
  ADD COLUMN "tokenType" "TokenType" NOT NULL DEFAULT 'USER',
  ADD COLUMN "statusDetail" TEXT;
