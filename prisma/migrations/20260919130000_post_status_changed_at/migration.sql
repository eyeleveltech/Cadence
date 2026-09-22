-- Track stage changes separately from any edit. Backfilled from
-- updatedAt, which is the closest thing to the truth we have for
-- existing rows.
ALTER TABLE "Post" ADD COLUMN "statusChangedAt" TIMESTAMPTZ(3);
UPDATE "Post" SET "statusChangedAt" = "updatedAt";
ALTER TABLE "Post"
  ALTER COLUMN "statusChangedAt" SET NOT NULL,
  ALTER COLUMN "statusChangedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- Publish times are instants a person chose in a particular place.
-- Storing them without an offset loses that the moment anything other
-- than this app reads the row.
ALTER TABLE "Post" ALTER COLUMN "scheduledAt" TYPE TIMESTAMPTZ(3);
ALTER TABLE "ScheduledJob" ALTER COLUMN "scheduledFor" TYPE TIMESTAMPTZ(3);
ALTER TABLE "ScheduledJob" ALTER COLUMN "publishedAt" TYPE TIMESTAMPTZ(3);
