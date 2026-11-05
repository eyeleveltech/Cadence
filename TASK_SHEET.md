# 📋 Cadence Master Task Sheet & Engineering Roadmap
**EyeLevel Growth Studio | Social Planning, Review & Multi-Platform Publishing Engine**

> **Current System Status**:
> * 🟢 **Web Server**: Running on `http://localhost:3000` (Next.js 15 App Router + Turbopack)
> * 🟢 **Production VPS**: `https://cadence.theeyelevelstudio.com` (Hostinger Cloud Docker)
> * 🟢 **Database**: Neon Cloud PostgreSQL (AWS Singapore, Prisma ORM, migrations applied & seeded)
> * 🟢 **Seeded Accounts**: 8 Team Members (`akmal@eyelevelstudio.in` / `cadence-dev-2026`) + 4 Clients
> * 🟢 **Live Email Service**: Resend (`noreply@theeyelevelstudio.com`) verified on GoDaddy DKIM/SPF
> * 🟢 **Health Score**: 0 TypeScript compile errors, 0 ESLint warnings, 63/63 Unit tests passing

---

## 📌 Master Task Matrix

| Task ID | Phase & Category | Priority | Task Summary | Status | Owner |
| :---: | :--- | :---: | :--- | :---: | :---: |
| **TASK-01** | **Meta Engine** | 🔴 P0 | Meta Graph API Instagram Publishing Container & Publish calls | ✅ Completed | Developer |
| **TASK-02** | **Meta Engine** | 🔴 P0 | Meta Graph API Facebook Page Photo & Feed Publish calls | ✅ Completed | Developer |
| **TASK-03** | **Meta Engine** | 🔴 P0 | Dev Simulation / Sandbox Publishing Mode (`SOCIAL_DEV_SIMULATE=1`) | ✅ Completed | Developer |
| **TASK-04** | **Post Editor** | 🔴 P0 | Leadership "🚀 Publish Now" button & instant server action | ✅ Completed | Developer |
| **TASK-05** | **Settings UI** | 🔴 P0 | Dev Mode Mock Connected Account button in Settings | ✅ Completed | Developer |
| **TASK-06** | **Worker & Queue** | 🔴 P0 | Upstash / Redis connection setup (`REDIS_URL`) | ⏳ To Do | Developer / DevOps |
| **TASK-07** | **Worker & Queue** | 🔴 P0 | Background Worker Process execution (`npm run worker:dev`) | ⏳ To Do | Developer / DevOps |
| **TASK-08** | **Email Service** | 🔴 P0 | Resend Email API setup for real Magic Link & Invite delivery | ✅ Completed | Developer |
| **TASK-09** | **Credentials** | 🟢 Done | Boss Harish Meta App ID (`1824727265203289`) & Secret set in `.env` | ✅ Completed | Harish / Admin |
| **TASK-10** | **Media Storage** | 🟢 Done | Cloudinary 25GB Cloud Storage Adapter integrated & verified | ✅ Completed | Developer |
| **TASK-11** | **Meta Clearance** | 🟠 P1 | Meta App Review submission (`pages_manage_posts`, `instagram_content_publish`) | ⏳ Gated by Meta | Admin / Agency |
| **TASK-12** | **LinkedIn Engine**| 🟡 P2 | LinkedIn Organization Post Publishing API (`/v2/ugcPosts`) | ✅ Completed | Developer |
| **TASK-13** | **LinkedIn App** | 🟢 Done | LinkedIn Developer App ID (`78fddqsm17dbkk`) & Secret set in `.env` | ✅ Completed | Admin / Developer |
| **TASK-14** | **YouTube Engine** | 🟡 P2 | Google YouTube Data API v3 Video / Shorts Upload integration | ✅ Completed | Developer |
| **TASK-15** | **YouTube OAuth** | 🟡 P2 | Google Cloud Console OAuth Client configuration | ✅ Completed | Admin |
| **TASK-16** | **Media Pipeline** | 🟡 P2 | FFmpeg Video Transcoding Worker for 9:16 Reels & Shorts | ⏳ Phase 2 | Developer |
| **TASK-17** | **Analytics** | 🟡 P2 | Insights tab Social Analytics sync background worker | ⏳ Phase 2 | Developer |
| **TASK-18** | **Team Roster** | 🟡 P2 | Display "Pending Invite" status badge for members awaiting setup | ⏳ Backlog | Developer |
| **TASK-19** | **X (Twitter)** | 🔴 P0 | X (Twitter) API v2 publishing, button labels & OAuth adapter | ✅ Completed | Developer |
| **TASK-20** | **Auth & Invite** | 🔴 P0 | Invite member via secure 7-day password setup link (`/set-password`) | ✅ Completed | Developer |
| **TASK-21** | **User Profile** | 🔴 P0 | Dedicated `/profile` page for in-page password change & email reset | ✅ Completed | Developer |

---

## 🚀 Detailed Phase Breakdown

### 🔴 Phase 1: Publishing Engines & Sandbox Simulation (Completed)
* ✅ **Instagram & Facebook Publishing**: Implemented in [lib/social/adapter.ts](lib/social/adapter.ts) supporting 2-step Instagram container flow, Facebook Page photos & feed publishing.
* ✅ **Dev Simulation Mode**: When sandbox mode is toggled, simulates network delays and generates realistic social platform IDs without requiring live API permissions.
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

### ⚙️ Phase 3: Background Worker & Infrastructure (Pending / Next Steps)
* ⏳ **[TASK-06] Upstash / Redis Connection**:
  * Configure cloud Redis URL (`REDIS_URL`) in `.env` for BullMQ queues in [lib/queue.ts](lib/queue.ts).
* ⏳ **[TASK-07] Background Worker Process**:
  * Run `npm run worker:dev` (or worker container in Docker). Sweeps scheduled posts every 60s, checks review deadlines (24h/48h), and monitors token health.
* ⏳ **[TASK-11] Meta App Review Submission**:
  * Submit screencast video demo to Meta for `pages_manage_posts`, `instagram_content_publish`, and `pages_read_engagement` production clearance.
* ⏳ **[TASK-16] FFmpeg Video Transcoding Worker**:
  * Auto-transcode raw uploaded videos into 9:16 H.264/AAC Story and Reel formats.
* ⏳ **[TASK-17] Social Analytics Periodic Sync**:
  * Sync reach, impressions, likes, and comments from platform APIs into `AnalyticsSnapshot` table.
* ⏳ **[TASK-18] Team Roster "Pending Invite" Badge**:
  * Show a `[ ⏳ Pending Invite ]` chip for team members who have been invited but haven't activated their password yet.

