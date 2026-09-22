# Migrations

`0_init` is the baseline: the whole schema as it stood when migrations
were introduced, generated offline with

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

**On a database that already has these tables** (any existing dev or
staging box created with `prisma db push`), mark the baseline as applied
instead of running it:

```bash
npx prisma migrate resolve --applied 0_init
```

**On an empty database**, `npx prisma migrate deploy` creates everything.
That is what `docker-compose.prod.yml`'s `migrate` service runs on every
deploy, before the app or the worker start.

From here on, schema changes go through `npm run db:migrate` and get
committed — `db push` is for throwaway local experiments only.

## One-off data fix: media URLs

Uploads moved out of `public/` and are now served by `/api/media`. Rows
created before that change still hold `/media/...` URLs and will 404.
There is no migration for this because it only affects databases that
were used for manual uploads during development — check first:

```sql
SELECT count(*) FROM "MediaAsset" WHERE "originalUrl" LIKE '/media/%';
```

If there are rows, repoint them:

```sql
UPDATE "MediaAsset"
   SET "originalUrl" = '/api' || "originalUrl"
 WHERE "originalUrl" LIKE '/media/%';

UPDATE "MediaVariant"
   SET "url" = '/api' || "url"
 WHERE "url" LIKE '/media/%';
```

The files themselves also need moving from `public/media` to
`MEDIA_ROOT` (default `./var/media`), keeping the same
`<clientId>/<assetId>/<file>` layout.
