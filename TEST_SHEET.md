# 📋 Cadence Live & Local — Master Manual Testing Sheet

**Live URL:** [https://cadence.theeyelevelstudio.com](https://cadence.theeyelevelstudio.com)  
**Local URL:** `http://localhost:3000`  
**Primary Admin Account:** `akmal@eyelevelstudio.in`  
**Default Dev Password:** `cadence-dev-2026`  

---

## 🎯 Test Execution Matrix

| Test ID | Feature Area | Description | Expected Outcome | Status |
| :--- | :--- | :--- | :--- | :---: |
| **TC-01** | Team Invite & Setup | Admin invites new member; member receives 7-day link | Email delivered; member sets own password via `/set-password` | ⬜ Pending |
| **TC-02** | Profile & Security | User updates password on `/profile` with eye toggles | Password updated; in-page success feedback; login with new pass | ⬜ Pending |
| **TC-03** | Forgot Password | User clicks "Forgot password?" on `/login` or `/profile` | Reset link emailed; token consumed upon password reset | ⬜ Pending |
| **TC-04** | Client Scoping | Assign Designer/Writer to specific Client in Settings | User only appears in that client's Post Editor assignment menu | ⬜ Pending |
| **TC-05** | Team Deletion | Admin deletes a team member using trash icon | User removed; posts/logs nullified or reassigned safely | ⬜ Pending |
| **TC-06** | Cloud Media Library | Upload Images & Videos (.mp4 / .mov) to Cloudinary | High-res thumbnails; HTML5 player plays video from cloud | ⬜ Pending |
| **TC-07** | YouTube OAuth | Connect YouTube Channel via Google OAuth in new tab | New tab opens; connects channel name with green tick badge | ⬜ Pending |
| **TC-08** | Dev Sandbox Mode | 1-Click Connect Sandbox account for Facebook/Meta/LinkedIn | Instant simulated social connection for zero-friction testing | ⬜ Pending |
| **TC-09** | X (Twitter) Engine | Connect X account & create tweet with media | Clean `[ 𝕏 Twitter ]` badge; tweet published via API v2 | ⬜ Pending |
| **TC-10** | Moodboard Scraper | Add Pinterest/Instagram/YouTube reference link | OpenGraph preview (image, title, host) auto-extracted | ⬜ Pending |
| **TC-11** | Calendar Planning | Create scheduled post on date cell with media & tags | Post created and displayed on Calendar view with metadata | ⬜ Pending |
| **TC-12** | Approval Lifecycle | Step post through IDEA ➔ IN PROGRESS ➔ APPROVED | Status transitions recorded; "Publish Now" button appears | ⬜ Pending |
| **TC-13** | Leadership Direct Publish | Admin clicks '🚀 Publish Now' with confirmation dialog | Post publishes immediately; status switches to `PUBLISHED` | ⬜ Pending |
| **TC-14** | Client Reviewer Magic Link | External client logs in via Magic Link tab | Magic link sent; reviewer accesses scoped review queue (`/review`) | ⬜ Pending |

---

## 📝 Detailed Step-by-Step Test Cases

### 🧪 [TC-01] Team Invite & Activation Link Flow
* **Goal:** Verify that admins can invite staff without emailing insecure temporary passwords.
* **Steps:**
  1. Sign in as Admin (`akmal@eyelevelstudio.in`).
  2. Go to **Team** (`/team`).
  3. Click **"+ Invite team member"**.
  4. Fill in Name (e.g. `Colleague Name`), real Email (e.g. your Gmail), and Role (`WRITER` or `DESIGNER`).
  5. Click **"Send invite"**.
  6. Check recipient's inbox for email from `Cadence <noreply@theeyelevelstudio.com>`.
  7. Click the **"Set Password & Get Started →"** button.
  8. Enter new password (min 10 characters) using the eye icon toggle, confirm it, and submit.
* **Expected Result:**
  * Member is activated; database updates password.
  * User is automatically signed into the Cadence workspace.
* **Status:** [ ] Pass / [ ] Fail

---

### 🧪 [TC-02] In-Page Profile & Password Management
* **Goal:** Verify the dedicated `/profile` page for password changes.
* **Steps:**
  1. Click the user profile row at the bottom-left of the sidebar.
  2. Verify it navigates to `/profile` (full page, not a popup).
  3. Under **Change Password**, enter current password, new password, and confirmation.
  4. Toggle eye icons to verify password visibility.
  5. Click **"Save New Password"**.
  6. Sign out and sign back in using the newly created password.
* **Expected Result:** Password updates cleanly and logs in successfully with the new password.
* **Status:** [ ] Pass / [ ] Fail

---

### 🧪 [TC-03] Forgot Password Recovery
* **Goal:** Verify self-service password recovery from both login and profile screens.
* **Steps:**
  1. Go to `/login`.
  2. Above the password field, click **"Forgot password?"**.
  3. Enter work email and click **"Send Reset Link"**.
  4. Open the reset email and set a new password on `/set-password`.
* **Expected Result:** Password reset email delivered; token verified and consumed; user accesses account.
* **Status:** [ ] Pass / [ ] Fail

---

### 🧪 [TC-04] Team Member Client Scoping
* **Goal:** Verify that Designers/Writers are scoped to authorized clients only.
* **Steps:**
  1. Go to a client workspace (e.g. **TESTING CLIENT**).
  2. Go to **Settings ➔ Team on this client**.
  3. Notice designers/writers not assigned to this client do not appear in post assignment.
  4. Click **"+ Add member"** and assign a designer.
  5. Open any post under that client ➔ Check Designer dropdown.
* **Expected Result:** The assigned designer now appears in the post's Designer dropdown menu.
* **Status:** [ ] Pass / [ ] Fail

---

### 🧪 [TC-05] Member Removal & Data Cascade
* **Goal:** Verify that removing a staff member cleans up database relationships without throwing foreign key errors.
* **Steps:**
  1. As Admin, navigate to `/team`.
  2. Click the trash icon next to a test member.
  3. Confirm deletion in the dialog.
* **Expected Result:** Member deleted; assigned posts/audit logs safely nullified; green toast confirmation shown.
* **Status:** [ ] Pass / [ ] Fail

---

### 🧪 [TC-06] Cloud Media Storage & Video Player
* **Goal:** Verify Cloudinary media uploads and player.
* **Steps:**
  1. Under any Client, navigate to the **Library** tab.
  2. Upload an image (`.png` / `.jpg`) and a video (`.mp4`).
* **Expected Result:** Image thumbnail generated; video player loads with smooth playback from Cloudinary CDN.
* **Status:** [ ] Pass / [ ] Fail

---

### 🧪 [TC-07] Multi-Platform Connected Accounts (New Tab OAuth)
* **Goal:** Verify connecting social platforms opens auth in a new browser tab.
* **Steps:**
  1. Go to Client **Settings ➔ Connected accounts**.
  2. Click **Connect** on Facebook, YouTube, or LinkedIn.
  3. Select **Connect**.
* **Expected Result:** OAuth provider screen opens in a **new tab (`target="_blank"`)**, keeping Cadence intact.
* **Status:** [ ] Pass / [ ] Fail

---

### 🧪 [TC-08] Dev Sandbox Simulation Publishing
* **Goal:** Verify 1-click sandbox testing without waiting for third-party developer approvals.
* **Steps:**
  1. In Client **Settings ➔ Connected accounts**, click **"Connect Sandbox Account"**.
  2. Go to **Plan ➔ Open a post**.
  3. Enable the connected sandbox platform.
  4. Advance status to `APPROVED` and click **"🚀 Publish Now"**.
* **Expected Result:** Simulated publish executes with realistic delay; post status switches to `PUBLISHED`.
* **Status:** [ ] Pass / [ ] Fail

---

### 🧪 [TC-09] X (Twitter) Tweet Publishing
* **Goal:** Verify X (Twitter) platform integration.
* **Steps:**
  1. Open a post editor.
  2. Verify platform selector shows clean `[ 𝕏 Twitter ]` button without duplicate "X" labels.
  3. Select Twitter, add caption/media, and publish.
* **Expected Result:** Post published via Twitter adapter; post tagged with Twitter platform icon.
* **Status:** [ ] Pass / [ ] Fail

---

### 🧪 [TC-10] Moodboard & OpenGraph Link Scraper
* **Goal:** Verify scraping creative references.
* **Steps:**
  1. Click the **Boards** tab under any client.
  2. Paste a public URL (e.g. Pinterest or YouTube).
  3. Click **Add to board**.
* **Expected Result:** Card created displaying auto-scraped OG image, title, and link.
* **Status:** [ ] Pass / [ ] Fail

---

### 🧪 [TC-11] Calendar Post Scheduling
* **Goal:** Verify post scheduling and view on calendar.
* **Steps:**
  1. Click **Plan** tab (Calendar view).
  2. Click any upcoming date cell and create a post with title, caption, and scheduled time.
* **Expected Result:** Post appears on the scheduled calendar date with metadata chip.
* **Status:** [ ] Pass / [ ] Fail

---

### 🧪 [TC-12] Status Approval Lifecycle
* **Goal:** Verify workflow progression from draft to client approval.
* **Steps:**
  1. Open post in editor.
  2. Progress status: `IDEA` ➔ `IN PROGRESS` ➔ `INTERNAL REVIEW` ➔ `APPROVED`.
* **Expected Result:** Status chips update in real-time; **"🚀 Publish Now"** button appears once `APPROVED`.
* **Status:** [ ] Pass / [ ] Fail

---

### 🧪 [TC-13] Leadership Direct Publish
* **Goal:** Verify instant server-side publish action.
* **Steps:**
  1. On an `APPROVED` post, click **"🚀 Publish Now"**.
  2. Confirm in modal.
* **Expected Result:** Publish triggered; toast notification displayed; status changes to `PUBLISHED`.
* **Status:** [ ] Pass / [ ] Fail

---

### 🧪 [TC-14] Client Reviewer Magic Link Portal
* **Goal:** Verify client reviewer passwordless login.
* **Steps:**
  1. Open Incognito window ➔ go to `/login`.
  2. Click **"Client reviewer"** tab.
  3. Enter assigned client reviewer email.
* **Expected Result:** Magic link emailed; link opens dedicated review queue `/review` without exposing internal agency screens.
* **Status:** [ ] Pass / [ ] Fail

---

## 📌 Sign-Off & Verification

* **Tester Name:** _________________________
* **Date Tested:** _________________________
* **Environment:** [ ] Local (`localhost:3000`)  /  [ ] Production VPS (`cadence.theeyelevelstudio.com`)
* **Overall Result:** [ ] 100% Pass  /  [ ] Needs Attention
* **Notes:**
