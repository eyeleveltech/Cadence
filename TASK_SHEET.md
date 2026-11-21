# 📋 Cadence Master Task Sheet & Engineering Roadmap
**EyeLevel Growth Studio | Social Planning, Review & Multi-Platform Publishing Engine**

> **Current System Status**:
> * 🟢 **Web Server**: Running on `http://localhost:3000` (Next.js 15 App Router + Turbopack)
> * 🟢 **Production VPS**: `https://cadence.theeyelevelstudio.com` (Hostinger Cloud Docker)
> * 🟢 **Database**: Neon Cloud PostgreSQL (AWS Singapore, Prisma ORM, migrations applied & seeded)
> * 🟢 **Seeded Accounts**: 8 Team Members (`akmal@eyelevelstudio.in` / `cadence-dev-2026`) + 4 Clients
> * 🟢 **Live Email Service**: Resend (`noreply@theeyelevelstudio.com`) verified on GoDaddy DKIM/SPF
> * 🟢 **Health Score**: 0 TypeScript compile errors, 0 ESLint warnings, 117/117 Unit tests passing (15 suites), Playwright E2E suites active

---

## 📌 Master Task Matrix

| Task ID | Phase & Category | Priority | Task Summary | Status | Owner |
| :---: | :--- | :---: | :--- | :---: | :---: |
| **TASK-01** | **Meta Engine** | 🔴 P0 | Meta Graph API Instagram Publishing Container & Publish calls | ✅ Completed | Developer |
| **TASK-02** | **Meta Engine** | 🔴 P0 | Meta Graph API Facebook Page Photo & Feed Publish calls | ✅ Completed | Developer |
| **TASK-03** | **Meta Engine** | 🔴 P0 | Dev Simulation / Sandbox Publishing Mode (`SOCIAL_DEV_SIMULATE=1`) | ✅ Completed | Developer |
| **TASK-04** | **Post Editor** | 🔴 P0 | Leadership "🚀 Publish Now" button & instant server action | ✅ Completed | Developer |
| **TASK-05** | **Settings UI** | 🔴 P0 | Dev Mode Mock Connected Account button in Settings | ✅ Completed | Developer |
| **TASK-06** | **Worker & Queue** | 🔴 P0 | Redis / Upstash connection setup (`REDIS_URL`) & BullMQ queue resilience | ✅ Completed | Developer / DevOps |
| **TASK-07** | **Worker & Queue** | 🔴 P0 | Background Worker Process execution (`worker/index.ts`, BullMQ repeatable jobs) | ✅ Completed | Developer / DevOps |
| **TASK-08** | **Email Service** | 🔴 P0 | Resend Email API setup for real Magic Link & Invite delivery | ✅ Completed | Developer |
| **TASK-09** | **Credentials** | 🟢 Done | Boss Harish Meta App ID (`1824727265203289`) & Secret set in `.env` | ✅ Completed | Harish / Admin |
| **TASK-10** | **Media Storage** | 🟢 Done | Cloudinary 25GB Cloud Storage Adapter integrated & verified | ✅ Completed | Developer |
| **TASK-11** | **Meta Clearance** | 🟠 P1 | Meta App Review submission (`pages_manage_posts`, `instagram_content_publish`) | ⏳ Gated by Meta | Admin / Agency |
| **TASK-12** | **LinkedIn Engine**| 🟡 P2 | LinkedIn Organization Post Publishing API (`/v2/ugcPosts` + 3-step asset upload) | ✅ Completed | Developer |
| **TASK-13** | **LinkedIn App** | 🟢 Done | LinkedIn Developer App ID (`78fddqsm17dbkk`) & Secret set in `.env` | ✅ Completed | Admin / Developer |
| **TASK-14** | **YouTube Engine** | 🟡 P2 | Google YouTube Data API v3 Video / Shorts Upload integration | ✅ Completed | Developer |
| **TASK-15** | **YouTube OAuth** | 🟡 P2 | Google Cloud Console OAuth Client configuration | ✅ Completed | Admin |
| **TASK-16** | **Media Pipeline** | 🟡 P2 | FFmpeg Video Transcoding Worker for 9:16 Reels/Shorts & poster frames | ✅ Completed | Developer |
| **TASK-17** | **Analytics** | 🟡 P2 | Insights tab Social Analytics sync worker (6-hour cron + on-demand sync) | ✅ Completed | Developer |
| **TASK-18** | **Team Roster** | 🟡 P2 | Display "⏳ Pending Invite" badge for members awaiting password setup | ✅ Completed | Developer |
| **TASK-19** | **X (Twitter)** | 🔴 P0 | X (Twitter) API v2 publishing, chunked media upload & RFC 7636 S256 PKCE OAuth | ✅ Completed | Developer |
| **TASK-20** | **Auth & Invite** | 🔴 P0 | Invite member via secure 7-day password setup link (`/set-password`) | ✅ Completed | Developer |
| **TASK-21** | **User Profile** | 🔴 P0 | Dedicated `/profile` page for in-page password change & email reset | ✅ Completed | Developer |
| **TASK-22** | **Security** | 🔴 P0 | SSRF TOCTOU DNS Rebinding Mitigation via pinned Undici socket dispatcher | ✅ Completed | Developer |
| **TASK-23** | **Security** | 🔴 P0 | Authentication & Password Reset sliding-window rate limiting | ✅ Completed | Developer |
| **TASK-24** | **Test Expansion** | 🔴 P0 | Server Action & multi-tenant isolation unit test suite (11 tests) | ✅ Completed | Developer |
| **TASK-25** | **Test Expansion** | 🟡 P2 | Playwright E2E editorial workflow and public route suite | ✅ Completed | Developer |

---

## 🚀 Detailed Phase Breakdown

### 🔴 Phase 1: Publishing Engines & Sandbox Simulation (Completed)
* ✅ **Instagram & Facebook Publishing**: Implemented in [lib/social/adapter.ts](lib/social/adapter.ts) supporting 2-step Instagram container flow, Facebook Page photos & feed publishing.
* ✅ **Dev Simulation Mode**: When `SOCIAL_DEV_SIMULATE=1` or using sandbox accounts (`sim_*`), simulates network delays and generates realistic social platform IDs without requiring live API permissions.
* ✅ **Leadership Direct Publish**: Admin/Manager "🚀 Publish Now" modal triggers immediate server-side publishing without waiting for worker sweeps.
* ✅ **X (Twitter) Integration**: Added `TWITTER` to Prisma schema enum, implemented API v2 tweet publisher in [lib/social/adapter.ts](lib/social/adapter.ts), OAuth in [lib/social/oauth.ts](lib/social/oauth.ts), and post editor integration.
* ✅ **LinkedIn & YouTube Publishing**: LinkedIn organization posts (`/v2/ugcPosts`) and YouTube Data API v3 video uploads.

---

### 🛡️ Phase 2: Authentication, Security & Team Governance (Completed)
* ✅ **Password Setup on Invite**:
  * Temporary passwords are removed from emails.
  * When an admin invites a team member, a secure 7-day token is generated and emailed with a branded button: `"Set Password & Get Started"`.
  * New `/set-password?token=...` page allows user to configure their own password (min 10 chars) with eye icon visibility toggles and auto-logs them in.
* ✅ **Dedicated `/profile` Page**:
  * Accessible from the bottom-left sidebar user profile row.
  * Full-page interface with user details (Name, Email, Role).
  * Direct in-page password update (Current Password + New Password + Confirm Password with eye toggles).
  * "Forgot Password?" email link trigger right on the profile page.
* ✅ **Login Page Password Recovery**:
  * "Forgot password?" modal on `/login` sends a reset link to any registered work email.
  * Eye icon toggle on password field.
* ✅ **Team Member Deletion**:
  * Admin can remove staff members with automatic foreign key nullification/cleanup across audit logs, posts, media assets, and accounts.
* ✅ **Designer/Writer Client Scoping**:
  * Designers and writers only appear in Post Assignment dropdowns if assigned to that specific client under Client Settings ➔ Team.

---

### ⚙️ Phase 3: Background Worker, Media Engine & Queue Resilience (Completed)
* ✅ **BullMQ Queue & Connection Resilience [TASK-06]**:
  * Configured `REDIS_URL` in [lib/queue.ts](lib/queue.ts) with graceful in-memory/no-op fallback when Redis is absent during local development.
* ✅ **Background Worker Process [TASK-07]**:
  * Standalone worker process in [worker/index.ts](worker/index.ts) running scheduled sweeps, deadline reminders, media processing, and recurring analytics.
* ✅ **FFmpeg Video Transcoding [TASK-16]**:
  * Automated 9:16 vertical reel/story transcoding and JPEG poster extraction at 1.0s via [lib/media-pipeline.ts](lib/media-pipeline.ts).
  * Graceful fallback check `isFfmpegAvailable()` preserves raw uploads cleanly if FFmpeg is uninstalled.
* ✅ **Multi-Platform Media Attachments**:
  * LinkedIn 3-step asset upload (`registerUpload`, binary stream PUT, and `ugcPosts` media attachment).
  * Twitter / 𝕏 chunked upload (`INIT`, `APPEND`, `FINALIZE`) with `media_ids` attachment.

---

### 📊 Phase 4: Social Analytics Synchronization & Roster Polish (Completed)
* ✅ **Multi-Platform Analytics Engine [TASK-17]**:
  * Created [lib/social/analytics.ts](lib/social/analytics.ts) querying Meta Graph API, LinkedIn Social Actions / Share Statistics, YouTube Data API v3, and Twitter API v2.
  * Deterministic simulation generator for local testing without live developer accounts.
  * Registered 6-hour repeatable BullMQ sync job in worker.
  * Created `syncClientAnalyticsNow` server action and "Sync Analytics" UI trigger on Client Insights tab.
* ✅ **Team Roster "Pending Invite" Badge [TASK-18]**:
  * Updated [lib/actions/team.ts](lib/actions/team.ts) to compute `isPendingInvite` status from active verification tokens.
  * Rendered distinct `⏳ Pending Invite` status chip in [app/(app)/team/team-roster.tsx](app/(app)/team/team-roster.tsx).

---

### 🔒 Phase 5: Security Hardening (Completed)
* ✅ **Twitter RFC 7636 S256 PKCE [TASK-22]**:
  * Cryptographically random 32-byte `code_verifier` generated per authorization request.
  * SHA-256 base64url `code_challenge` sent with `code_challenge_method: "S256"`.
  * Verified in callback exchange with tamper-evident encrypted cookies.
* ✅ **SSRF TOCTOU DNS Rebinding Mitigation [TASK-23]**:
  * Socket-level DNS-pinned Undici Agent in [lib/og-scrape.ts](lib/og-scrape.ts) ensuring validated IPs cannot rebind between check and TCP connection.
* ✅ **Authentication Rate Limiting [TASK-24]**:
  * Sliding-window rate limiter in [lib/rate-limit.ts](lib/rate-limit.ts) protecting sign-in and forgot-password endpoints.

---

### 🧪 Phase 6: Test Coverage & Quality Alignment (Completed)
* ✅ **Server Action & Multi-Tenant Isolation Tests [TASK-25]**:
  * 11 unit/integration tests in [test/actions.test.ts](test/actions.test.ts) verifying multi-tenant scoping, `notFound()` enforcement, client reviewer workspace restriction, self-review block, and valid status transition graph.
* ✅ **Playwright E2E Suite [TASK-26]**:
  * Expanded [e2e/workflow.spec.ts](e2e/workflow.spec.ts) covering unauthenticated public access to `/set-password`, staff sign-in, client workspace navigation, and post editor controls.
* ✅ **Documentation & Configuration Alignment**:
  * Reconciled `RESEND_FROM_EMAIL` across `.env.example`, `.env`, and `HANDOVER.md`.
  * Documented `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`, `SOCIAL_DEV_SIMULATE`, and `FFMPEG_PATH`.
  * Documented `R2_*` as optional / planned future object storage migration.
