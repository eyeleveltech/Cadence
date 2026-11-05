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
* **Authentication:** Better Auth (Email/Password for staff + Magic Links for client reviewers)
* **Media Storage:** Cloudinary 25GB Cloud Storage Adapter (Direct CDN upload & video playback)
* **Email Service:** Resend API (`noreply@theeyelevelstudio.com` verified on GoDaddy DKIM/SPF)
* **Social Adapters:** Meta Graph API (Instagram & Facebook), LinkedIn (`/v2/ugcPosts`), Google YouTube Data API v3, Twitter / 𝕏 API v2
* **Queue & Automation:** BullMQ + Redis / Upstash (for scheduled sweeps & worker jobs)

---

## ⚡ Quick Start: Running Locally

### 1. Prerequisites
* Node.js v20+ or v24
* Git

### 2. Environment Variables (`.env`)
Ask the project lead (Akmal) for the team's shared `.env` file or populate it following `.env.example`:
```env
# Database (Neon PostgreSQL Cloud)
DATABASE_URL="postgresql://<user>:<password>@<neon-host>/neondb?sslmode=require&channel_binding=require"

# Auth
BETTER_AUTH_SECRET="your-32-char-secret-key"
BETTER_AUTH_URL="http://localhost:3000"
TOKEN_ENCRYPTION_KEY="your-token-encryption-key"
SEED_PASSWORD="cadence-dev-2026"
SEED_ALLOW_REMOTE="1"

# Email (Resend Live Outbound Delivery)
RESEND_API_KEY="re_..."
RESEND_FROM_EMAIL="Cadence <noreply@theeyelevelstudio.com>"

# Cloudinary Storage
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-api-secret"

# Meta Developer App
META_APP_ID="your-meta-app-id"
META_APP_SECRET="your-meta-app-secret"

# LinkedIn Developer App
LINKEDIN_CLIENT_ID="your-linkedin-client-id"
LINKEDIN_CLIENT_SECRET="your-linkedin-client-secret"

# Google / YouTube Developer App
GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

### 3. Install & Start Server
```bash
# Install dependencies
npm install

# Generate Prisma Client
npx prisma generate

# Start development server
npm run dev
```
Open **`http://localhost:3000`** in your browser.

---

## 🔑 Default Seeded Accounts

| Role | Name | Email | Default Password |
| :--- | :--- | :--- | :--- |
| **ADMIN** | Akmal Rahman | `akmal@eyelevelstudio.in` | `cadence-dev-2026` |
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
  * `clients/[clientId]/`: Client tabs (Plan calendar/board, Media Library, Moodboards, Comms, Insights, Settings).
  * `posts/[postId]/`: Post editor, platform toggles, asset attachments, workflow advancing, and "🚀 Publish Now" leadership button.
  * `team/`: Agency staff roster, role management, member invitations, and member removal.
  * `profile/`: Dedicated full-page **Account & Security** settings with in-page password change and email reset link.
* **`app/login/`**: Dual sign-in tab interface (Staff password login with eye visibility toggle + "Forgot password?" modal, and Client Reviewer passwordless magic link).
* **`app/set-password/`**: Branded activation page where invited members set their own passwords from email links.
* **`lib/social/`**:
  * `adapter.ts`: Core publishing engines for Instagram, Facebook, LinkedIn, YouTube, and Twitter (with sandbox simulation support).
  * `oauth.ts`: Platform OAuth endpoints, token exchange, and account discovery.
* **`lib/actions/`**: Next.js Server Actions:
  * `team.ts`: User management, invite tokens, password changes, member deletion.
  * `posts.ts`: Post CRUD, publishing, status advance sequence.
  * `social-accounts.ts`: Social account connection & sandbox linking.
* **`lib/email.ts`**: Resend API integration for password setup links, magic links, and invites.

---

## 💡 Important Rules & Gotchas

1. **Designer & Writer Client Scoping**:
   * Admins and Managers see all clients automatically.
   * Designers and Writers will **only** appear in a post's assignment dropdown if they have been explicitly added to that client under **Client Settings ➔ Team on this client**.
2. **Sandbox vs Real Publishing**:
   * For rapid testing without waiting for third-party API review approvals, click **"🧪 Connect Sandbox Account"** in Client Settings. It allows full post creation, review, and instant publishing.
3. **Password Security**:
   * Temporary passwords are never emailed. New members receive a secure 7-day token link to set their own password on `/set-password`.
4. **Prisma on Windows**:
   * If running `npx prisma generate` while `npm run dev` is active on Windows, stop the dev server first to avoid `EPERM` file-locking on `query_engine-windows.dll.node`.

---

## 📞 Support & Contacts
* **Project Owner / Tech Lead:** Akmal Rahman (`akmal@eyelevelstudio.in`)
* **DevOps / Infra:** Harish (`harish@eyelevelstudio.in`)
