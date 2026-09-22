# Cadence

EyeLevel Growth Studio's social media planning tool — one workspace per
client holding the content plan, media library, mood boards, and full
communication record. See the product plan for the full spec, phased
roadmap, and platform API research this build follows.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind + shadcn/ui (Base UI
primitives) · Prisma + PostgreSQL · Better Auth · Zod · TanStack Query ·
dnd-kit · FullCalendar · BullMQ + Redis · sharp

## Local setup

Requires Postgres and Redis. Either run them via Docker:

```bash
docker compose up -d
```

...or point `.env` at existing local instances.

```bash
npm install
npx prisma migrate deploy   # creates tables from prisma/migrations
npm run db:seed             # EyeLevel's team + 4 clients, dev password printed at the end
npm run dev
```

If your database already has the tables (it predates migrations), baseline
it instead of applying `0_init` — see [prisma/migrations/README.md](prisma/migrations/README.md).

Sign in at `/login` with any `@eyelevelstudio.in` address the seed
script prints, or use the "Client" tab for magic-link sign-in (client
reviewers have no password — see `lib/auth.ts`).

```bash
npm test          # unit tests
npm run test:e2e  # Playwright, needs a seeded DB and a dev server
```

## Access model

Five roles. `ADMIN` and `MANAGER` reach every client; `WRITER` and
`DESIGNER` reach the clients they're assigned to; `CLIENT_REVIEWER` is
the client's own person and reaches nothing but `/review`.

Three helpers in `lib/session.ts` enforce it, and **authorization lives
in the server action, not the page**. A layout redirect only hides UI —
server actions are POST endpoints whose ids ship in the client bundle, so
anything that guards data guards it in the action:

- `requireRole(...)` — global role gate.
- `requireClientAccess(id)` — reviewer-level: membership, or leadership.
  Almost nothing should use this directly.
- `requireClientWorkspaceAccess(id)` — the internal boundary. Client
  access *and* an agency role. This is the default for anything in the
  workspace: plan, library, boards, comms, insights, brand kit.

Denials are 404s, not 403s, so a wrong id and someone else's id look the
same from outside.

Two more rules worth knowing before changing them:

- **Post status** moves through the state machine in `lib/roles.ts`
  (`refusePostStatusChange`). `PUBLISHED`/`FAILED` are the worker's to
  set; `APPROVED`/`SCHEDULED` are leadership-only; scheduling requires an
  approved post with a future slot and at least one platform.
- **Comments** carry a `visibility`. The review portal shows only
  `CLIENT`; internal craft discussion on the same thread stays internal.

Accounts are invite-only. The public sign-up endpoint is refused in
`app/api/auth/[...all]/route.ts` — see the comment there before touching
`emailAndPassword` in `lib/auth.ts`.

## Media

Uploads are written **outside** the web root (`MEDIA_ROOT`, default
`./var/media`) and served by `app/api/media/[...key]`, which checks the
caller can reach the owning client. Content types come from a whitelist
in that route, never from the uploaded filename or the browser-declared
MIME — and images are identified by their actual bytes via sharp, so a
file claiming to be a JPEG has to be one.

In production this path needs a volume (`docker-compose.prod.yml` mounts
`cadence_media` on both the app and the worker) or the library dies with
the container.

## What's real right now vs. what's stubbed

**Working end to end, no external credentials needed:**
- Auth (email/password for team, magic link for clients), 5 roles, per-client access scoping
- Client workspace — Plan (calendar + backlog), Library (bulk upload with
  real image processing via sharp — JPEG conversion, Story 9:16 crop,
  thumbnails), Boards (mood boards, URL ingest via Open Graph scrape),
  Comms (communication log), Insights (honest empty state), Settings
- Post editor — platforms, caption, hashtags, collaborators, Story toggle,
  asset attachment, assignment, full approval comment thread and state machine
- Client review portal (`/review`) — approve / request changes / comment
- Notifications — in-app bell backed by an SSE stream (`/api/notifications/stream`)
- Worker (`worker/`) — scheduled-post sweep, review-deadline reminders,
  account-health checks, all running against BullMQ

**Deliberately stubbed, waiting on external approvals or credentials:**
- Media storage is local disk (`lib/storage.ts`), not Cloudflare R2 yet —
  swap the one exported adapter once R2 credentials exist. Keep the
  bucket private and keep serving through `/api/media`.
- Video transcoding (ffmpeg, for Reel/Story format conformance) — noted
  as a Phase 2 worker job in `lib/media-pipeline.ts`, not built yet
- Platform publishing (Meta, LinkedIn, YouTube) — OAuth connect works and
  stores encrypted tokens, but `lib/social/adapter.ts` throws rather than
  faking a publish. Gated on Meta App Review, LinkedIn Community
  Management vetting, and Google's YouTube compliance audit — all
  multi-week, external, and outside our control.

## Commands

```bash
npm run dev             # dev server
npm run build           # production build
npm test                # unit tests
npm run test:e2e        # Playwright
npm run db:studio       # Prisma Studio — browse the database visually
npm run db:migrate      # create a migration from a schema change
npm run db:seed         # local only; refuses production and remote databases
npm run worker:dev      # BullMQ worker
```
