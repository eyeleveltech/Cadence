# 🚀 Cadence Project Handover & Engineering Guide
**EyeLevel Growth Studio | Social Media Planning & Multi-Platform Publishing Engine**

Welcome to the **Cadence** codebase! This document provides everything you need to run, test, develop, and deploy Cadence.

---

## 🧭 Quick Links & Documents
* 📋 **Task Sheet & Roadmap:** [`TASK_SHEET.md`](./TASK_SHEET.md) — Detailed breakdown of all completed and pending tasks (TASK-01 to TASK-21).
* 🧪 **Manual Test Sheet:** [`TEST_SHEET.md`](./TEST_SHEET.md) — 14 step-by-step test cases for local and live verification.
* 🌐 **Live Production URL:** [https://cadence.theeyelevelstudio.com](https://cadence.theeyelevelstudio.com)
* 💻 **Local Development URL:** [http://localhost:3000](http://localhost:3000)

---

## 🛠️ Technology Stack
* **Framework:** Next.js 15 (App Router, Turbopack, React 19)
* **Database & ORM:** Neon Cloud PostgreSQL (AWS Singapore) + Prisma ORM
* **Authentication & Security:** Better Auth, sliding-window rate limiting (`lib/rate-limit.ts`), RFC 7636 S256 PKCE for OAuth (`lib/social/oauth.ts`), and DNS-pinned SSRF protection (`lib/og-scrape.ts`).
* **Media Storage & Pipeline:** Cloudinary Cloud Storage Adapter + Local Disk fallback, with FFmpeg automated 9:16 vertical video transcoding and poster extraction (`lib/media-pipeline.ts`).
* **Email Service:** Resend API (`noreply@theeyelevelstudio.com` verified on GoDaddy DKIM/SPF).
* **Social Adapters & Publishing:** Meta Graph API (Instagram & Facebook), LinkedIn (`/v2/ugcPosts` + 3-step asset upload), Google YouTube Data API v3, Twitter / 𝕏 API v2 (with chunked media upload), plus unified social analytics sync (`lib/social/analytics.ts`).
* **Queue & Background Worker:** BullMQ + Redis / Upstash (`worker/index.ts`) with scheduled publishing sweeps, media transcoding, review deadline notifications, and 6-hour recurring analytics synchronization.
* **Testing:** Vitest (106 unit & integration tests) + Playwright E2E test suite (`e2e/`).

---

## ⚡ Quick Start: Running Locally

### 1. Prerequisites
* Node.js v20+ or v24
* Git
* Redis (local via Docker `docker compose up -d redis` or Cloud Upstash Redis URL)
* FFmpeg (optional; video transcoding falls back gracefully if not installed)

### 2. Environment Variables (`.env`)
Ask the project lead (Akmal) for the team's shared `.env` file or populate it following `.env.example`:
```env
# Database (Neon PostgreSQL Cloud or local docker-compose Postgres)
DATABASE_URL="postgresql://<user>:<password>@<neon-host>/neondb?sslmode=require&channel_binding=require"

# Redis (BullMQ queue & worker)
REDIS_URL="redis://localhost:6379"

# Auth & Encryption
BETTER_AUTH_SECRET="your-32-char-secret-key"
BETTER_AUTH_URL="http://localhost:3000"
TOKEN_ENCRYPTION_KEY="your-token-encryption-key"
SEED_PASSWORD="cadence-dev-2026"
SEED_ALLOW_REMOTE="1"

# Email (Resend Live Outbound Delivery — matching GoDaddy DKIM/SPF)
RESEND_API_KEY="re_..."
RESEND_FROM_EMAIL="Cadence <noreply@theeyelevelstudio.com>"

# Media Storage (Cloudinary default, or local disk fallback)
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-api-secret"

# Optional / Planned: Cloudflare R2 object storage (reserved for future migration)
# R2_ACCOUNT_ID=""
# R2_ACCESS_KEY_ID=""
# R2_SECRET_ACCESS_KEY=""
# R2_BUCKET_NAME="cadence-media"
# R2_PUBLIC_URL=""

# Social Platforms Developer Credentials
META_APP_ID="your-meta-app-id"
META_APP_SECRET="your-meta-app-secret"
META_GRAPH_API_VERSION="v26.0"

LINKEDIN_CLIENT_ID="your-linkedin-client-id"
LINKEDIN_CLIENT_SECRET="your-linkedin-client-secret"

GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

TWITTER_CLIENT_ID="your-twitter-client-id"
TWITTER_CLIENT_SECRET="your-twitter-client-secret"

# Development Simulation Mode (1 = simulate social publishing & analytics metrics locally)
SOCIAL_DEV_SIMULATE="1"

# Optional: Custom path to FFmpeg binary (defaults to system PATH or fallback)
FFMPEG_PATH=""
```

### 3. Install & Start Server
```bash
# Install dependencies
npm install

# Generate Prisma Client
npx prisma generate

# Start development server
npm run dev

# (In a separate terminal) Start background queue worker
npm run worker:dev
```
Open **`http://localhost:3000`** in your browser.

---

## 🔑 Default Seeded Accounts

| Role | Name | Email | Default Password |
| :--- | :--- | :--- | :--- |
| **ADMIN** | Akmal Rahman | `akmal@eyelevelstudio.in` | `cadence-dev-2026` |
| **ADMIN** | Vishvashvar | `vvishvashvar@gmail.com` | `cadence-dev-2026` |
| **MANAGER** | Dilshad | `dilshad@eyelevelstudio.in` | `cadence-dev-2026` |
| **MANAGER** | Janani | `janani@eyelevelstudio.in` | `cadence-dev-2026` |
| **WRITER** | Shyam | `shyam@eyelevelstudio.in` | `cadence-dev-2026` |
| **WRITER** | Shakila | `shakila@eyelevelstudio.in` | `cadence-dev-2026` |
| **DESIGNER** | Sneha | `sneha@eyelevelstudio.in` | `cadence-dev-2026` |
| **DESIGNER** | Ramya | `ramya@eyelevelstudio.in` | `cadence-dev-2026` |
| **DESIGNER** | Aditya | `aditya@eyelevelstudio.in` | `cadence-dev-2026` |

---

## 🚀 Live Production Deployment (Hostinger VPS)

* **Server IP:** `91.108.105.155`
* **Domain:** `https://cadence.theeyelevelstudio.com`
* **Docker Compose Config:** `docker-compose.prod.yml`

### To Deploy / Rebuild on Production VPS:
Connect via SSH to the VPS terminal:
```bash
cd /root/Cadence # or your app path
git pull origin main

# Ensure .env.production has all active credentials
docker compose -f docker-compose.prod.yml up -d --build
```

---

## 📂 Key Architecture & Codebase Map

* **`app/(app)/`**: Authenticated staff workspace:
  * `planner/`: Main agency calendar, client cards, and queue.
  * `clients/[clientId]/`: Client workspace tabs:
    * `plan/`: Interactive FullCalendar & dnd-kit Kanban Board.
    * `library/`: Media asset management & upload pipeline.
    * `boards/`: Moodboards & brand kits.
    * `comms/`: Internal and external communication logs.
    * `insights/`: Real-time post performance analytics + "Sync Analytics" on-demand trigger.
    * `settings/`: Connected social accounts, sandbox mode toggle, brand kit, and team memberships.
  * `posts/[postId]/`: Post editor, platform toggles, asset attachments, workflow advance sequence, and leadership "Publish Now" button.
  * `team/`: Agency staff roster with `⏳ Pending Invite` badges, role picker, invitations, and member removal.
  * `profile/`: Dedicated full-page **Account & Security** settings with in-page password change and email reset link.
* **`app/login/`**: Dual sign-in tab interface (Staff password login with eye visibility toggle + "Forgot password?" modal, and Client Reviewer passwordless magic link).
* **`app/set-password/`**: Branded public activation page where invited members configure their own password.
* **`lib/social/`**:
  * `adapter.ts`: Multi-platform publishing engines:
    * Instagram (2-step container publishing)
    * Facebook Page (photos & feed)
    * LinkedIn (3-step asset upload: `registerUpload` -> binary PUT -> `ugcPosts`)
    * YouTube (Google Data API v3 video upload)
    * Twitter / 𝕏 (API v2 with chunked `INIT`/`APPEND`/`FINALIZE` media upload)
    * Sandbox simulation for instant local development without credentials.
  * `analytics.ts`: Multi-platform engagement metrics fetcher (`fetchPostMetrics`) querying Meta Graph API, LinkedIn Social Actions / Share Statistics, YouTube Data API v3, Twitter API v2 public metrics, with simulated metrics fallback.
  * `oauth.ts` & `oauth-state.ts`: Dynamic RFC 7636 S256 PKCE generation, encrypted state cookies, and token exchange.
* **`lib/media-pipeline.ts`**: Video transcoding pipeline utilizing FFmpeg to produce 9:16 vertical reels/stories and 1s JPEG poster frames, with `isFfmpegAvailable()` graceful fallback.
* **`lib/rate-limit.ts`**: Sliding-window in-memory rate limiter protecting `/api/auth/sign-in/*` (5 req / 60s) and forgot password requests (3 req / 15m).
* **`lib/og-scrape.ts`**: DNS-pinned HTTP dispatcher preventing SSRF TOCTOU rebinding attacks by validating resolved IPs before establishing socket connections.
* **`lib/actions/`**: Next.js Server Actions with strict multi-tenant authorization guards:
  * `team.ts`: User management, invite tokens, pending invite status, password updates, member removal.
  * `posts.ts`: Post CRUD, status advancing, self-review block enforcement, and instant publishing.
  * `analytics.ts`: `syncClientAnalyticsNow` on-demand synchronization action.
  * `social-accounts.ts`: Account connection, sandboxing, and token refresh.
* **`worker/index.ts`**: Standalone BullMQ background process handling queued post publishing, video transcoding, 6-hour recurring analytics sweeps, and review deadline alerts.

---

## 🛡️ Security & Architecture Hardening Summary

1. **RFC 7636 S256 PKCE for Twitter OAuth (SEC-02)**:
   * Dynamic cryptographically secure 32-byte `code_verifier` generated per authorization request.
   * SHA-256 base64url `code_challenge` sent with `code_challenge_method: "S256"`.
   * Stored in encrypted, tamper-evident HTTP-only cookies and verified during token exchange.
2. **SSRF TOCTOU DNS Rebinding Mitigation (SEC-03)**:
   * `lib/og-scrape.ts` employs a custom socket-level DNS-pinned Undici Agent.
   * Hostnames are resolved once, checked against private/loopback/link-local IPv4 & IPv6 subnets, and pinned to that exact verified IP for the TCP connection.
   * All redirect hops re-verify target IPs before connecting.
3. **Authentication Rate Limiting (SEC-04)**:
   * Sliding-window rate limiter in `lib/rate-limit.ts` stops brute-force credential stuffing and password reset flooding with standard `429 Too Many Requests` responses.
4. **Media Transcoding Resilience**:
   * Videos automatically queue 9:16 vertical reel variants and poster frame extraction.
   * If FFmpeg is missing from the host machine, Cadence logs a diagnostic warning and preserves the uploaded media without failing the upload or crashing workers.
5. **Multi-Tenant Isolation**:
   * Server actions rigorously verify user permissions via `requireUser()` and client membership scoping.
   * Unauthorized cross-client access attempts immediately throw Next.js `notFound()`.
   * Self-review guard prevents post assignees from approving their own work.

---

## 💡 Important Rules & Gotchas

1. **Designer & Writer Client Scoping**:
   * Admins and Managers see all clients automatically.
   * Designers and Writers will **only** appear in a post's assignment dropdown if they have been explicitly added to that client under **Client Settings ➔ Team on this client**.
2. **Sandbox vs Real Publishing**:
   * For rapid testing without waiting for third-party API review approvals, set `SOCIAL_DEV_SIMULATE=1` or click **"🧪 Connect Sandbox Account"** in Client Settings. It enables complete post creation, review, instant publishing, and simulated analytics.
3. **Password Security**:
   * Temporary passwords are never emailed. New members receive a secure 7-day token link to set their own password on `/set-password`.
4. **Prisma on Windows**:
   * If running `npx prisma generate` while `npm run dev` is active on Windows, stop the dev server first to avoid `EPERM` file-locking on `query_engine-windows.dll.node`.

---

## 🧪 Testing & Verification

* **Unit & Integration Tests:**
  ```bash
  npm test
  ```
  Runs Vitest with 15 test suites and 117 automated tests covering actions, multi-tenancy, rate limiting, SSRF protection, media transcoding, analytics, and social adapters.
* **Type Checking:**
  ```bash
  npx tsc --noEmit
  ```
* **Linting:**
  ```bash
  npm run lint
  ```
* **End-to-End Tests:**
  ```bash
  npm run test:e2e
  ```
  Runs Playwright E2E suites covering authentication, team navigation, post workflows, and public `/set-password` access.

---

## 📞 Support & Contacts
* **Project Owner / Tech Lead:** Akmal Rahman (`akmal@eyelevelstudio.in`)
* **DevOps / Infra:** Harish (`harish@eyelevelstudio.in`)
