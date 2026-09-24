# 📋 Cadence Live Production — Manual Testing Sheet

**Live URL:** [https://cadence.theeyelevelstudio.com](https://cadence.theeyelevelstudio.com)  
**Target Environment:** Production (Hostinger Cloud / VPS)  
**Primary Admin Account:** `akmal@eyelevelstudio.in`  
**Password:** `cadence-dev-2026`  

---

## 🎯 Test Execution Matrix

| Test ID | Feature Area | Description | Expected Outcome | Status |
| :--- | :--- | :--- | :--- | :---: |
| **TC-01** | Team Management | Invite new agency member via Admin modal | User added to roster with selected role badge | ⬜ Pending |
| **TC-02** | Client Workspace | Create new Client with tone of voice & slug | Workspace tabs (Plan, Library, Boards, etc.) initialized | ⬜ Pending |
| **TC-03** | Cloud Media Library | Upload Images & Videos (.mp4 / .mov) to Cloudinary | Images get thumbnails; Videos get in-browser player with controls | ⬜ Pending |
| **TC-04** | YouTube OAuth | Connect YouTube Channel via Google OAuth | Channel connects with channel name and green tick badge | ⬜ Pending |
| **TC-05** | Dev Sandbox Mode | 1-Click Connect Sandbox account for Meta/LinkedIn | Instant simulated social connection for zero-friction testing | ⬜ Pending |
| **TC-06** | Moodboards / Scraper | Add Pinterest/Instagram/YouTube reference URL | OpenGraph metadata (image, title) auto-extracted into card | ⬜ Pending |
| **TC-07** | Calendar Planning | Create scheduled post on date cell with media & tags | Post created and visible on calendar view with metadata | ⬜ Pending |
| **TC-08** | Approval Workflow | Transition status through IDEA ➔ APPROVED | Status transitions recorded; 'Publish Now' button appears | ⬜ Pending |
| **TC-09** | Leadership Direct Publish | Admin clicks 'Publish Now' with confirmation dialog | Post publishes to YouTube / Sandbox; status becomes PUBLISHED | ⬜ Pending |
| **TC-10** | Client Reviewer Magic Link | External client logs in via Magic Link tab | Magic link sent; reviewer accesses scoped review queue | ⬜ Pending |

---

## 📝 Detailed Step-by-Step Test Cases

### 🧪 [TC-01] Team Management (Invite Member)
* **Goal:** Verify that Agency Admin can invite new writers, designers, and managers.
* **Steps:**
  1. Go to `https://cadence.theeyelevelstudio.com/team`
  2. Click the blue **"+ Invite team member"** button at top right.
  3. Enter Name (e.g., `Harish Bro`), Email (e.g., `harish@eyelevelstudio.in`), and Role (`ADMIN` or `MANAGER`).
  4. Click **Invite**.
* **Expected Result:** Member appears in the roster with name, email, and proper role badge.
* **Status:** [ ] Pass / [ ] Fail

---

### 🧪 [TC-02] Client Workspace Creation
* **Goal:** Verify creating a client workspace with proper routing and tab isolation.
* **Steps:**
  1. Click **Clients** in the left sidebar.
  2. Click **"+ New client"**:
     * **Name:** `Right Hospitals` (or your client name)
     * **Slug:** `right-hospitals`
     * **Tone of Voice:** Warm, reassuring healthcare communication.
  3. Click **Create client**.
* **Expected Result:** Redirects to `/clients/[clientId]/plan`. Tabs visible: `Plan | Library | Boards | Comms | Insights | Settings`.
* **Status:** [ ] Pass / [ ] Fail

---

### 🧪 [TC-03] Cloud Media Storage & Video Player
* **Goal:** Verify Cloudinary 500MB media upload and interactive video player.
* **Steps:**
  1. Click the **Library** tab under the client.
  2. Drop an Image (`.jpg` / `.png`) and a Video (`.mp4` / `.mov`).
  3. Wait for upload completion toast.
* **Expected Result:**
  * Image displays a high-resolution preview and thumbnail.
  * Video displays an HTML5 video player with **Play / Pause / Volume / Fullscreen** controls.
  * Clicking Play plays the video smoothly from Cloudinary.
* **Status:** [ ] Pass / [ ] Fail

---

### 🧪 [TC-04] YouTube OAuth Account Connection
* **Goal:** Verify live Google OAuth connection with YouTube channel.
* **Steps:**
  1. Go to Client **Settings** ➔ **Connected Platform Accounts**.
  2. Under **YouTube**, click **Connect**.
  3. In the Google popup, select the authorized channel Google account and grant permissions.
* **Expected Result:** Redirects back to Cadence with green tick and connected Channel Name displayed.
* **Status:** [ ] Pass / [ ] Fail

---

### 🧪 [TC-05] Dev Sandbox Account Connection
* **Goal:** Verify 1-click sandbox connection for instant cross-platform testing.
* **Steps:**
  1. In Client **Settings** ➔ **Connected Platform Accounts**.
  2. Click **"Connect Sandbox Account"** on Meta or LinkedIn.
* **Expected Result:** Instant connection created without waiting for external API approvals, ready for simulated publishing.
* **Status:** [ ] Pass / [ ] Fail

---

### 🧪 [TC-06] Moodboard & OpenGraph Link Scraper
* **Goal:** Verify link preview scraper for creative references.
* **Steps:**
  1. Click the **Boards** tab under the client.
  2. Paste any public reference link (e.g. YouTube video URL or Instagram URL).
  3. Click **Add to board**.
* **Expected Result:** Card is added displaying auto-scraped OG image, title, and external domain link.
* **Status:** [ ] Pass / [ ] Fail

---

### 🧪 [TC-07] Calendar Planning & Asset Attachment
* **Goal:** Verify scheduled post creation with attached media assets.
* **Steps:**
  1. Click the **Plan** tab (Calendar view).
  2. Click on today's or tomorrow's date cell.
  3. Fill in:
     * **Title:** `Launch Campaign 2026`
     * **Caption:** `Excited to announce our grand launch!`
     * **Hashtags:** `#launch, #growth, #eyelevel`
     * **Platforms:** Select `YouTube` and/or `Instagram`.
  4. Under **Assets**, click **`+`** ➔ Select the video/image uploaded in TC-03.
  5. Assign Designer and Writer from dropdowns.
* **Expected Result:** Post is created; attached video preview is displayed; post card appears on the Calendar date.
* **Status:** [ ] Pass / [ ] Fail

---

### 🧪 [TC-08] Approval Workflow Lifecycle
* **Goal:** Verify status lifecycle transitions and permission guards.
* **Steps:**
  1. Open the post in Post Editor.
  2. In the right panel Status dropdown, step through:
     `IDEA` ➔ `IN PROGRESS` ➔ `INTERNAL REVIEW` ➔ `APPROVED`.
* **Expected Result:**
  * Status badge updates in real-time.
  * When status reaches `APPROVED`, the top-right **"Publish Now"** button appears for Admin/Leadership.
* **Status:** [ ] Pass / [ ] Fail

---

### 🧪 [TC-09] Leadership Direct Publish
* **Goal:** Verify manual immediate multi-platform publishing.
* **Steps:**
  1. On the `APPROVED` post, click the top right **"Publish Now"** button.
  2. Confirm dialog modal opens: *"Are you sure you want to publish now?"*.
  3. Click **"Yes, Publish Now"**.
* **Expected Result:**
  * Modal shows loading state.
  * Toast notification: `Published successfully!`.
  * Post status switches to **`PUBLISHED`** with a green badge and publication timestamp.
  * Video appears in YouTube Studio / live channel or sandbox log.
* **Status:** [ ] Pass / [ ] Fail

---

### 🧪 [TC-10] Client Reviewer Magic Link Portal
* **Goal:** Verify passwordless magic-link sign in for brand reviewers.
* **Steps:**
  1. Open a new Incognito / Private window.
  2. Visit `https://cadence.theeyelevelstudio.com/login`.
  3. Switch to the **"Client reviewer"** tab.
  4. Enter an assigned client email address and click **"Send link"**.
* **Expected Result:** Magic link request succeeds and redirects authorized reviewer to their dedicated review portal (`/review`).
* **Status:** [ ] Pass / [ ] Fail

---

## 📌 Sign-Off & Review Notes

* **Tester Name:** _________________________
* **Date Tested:** _________________________
* **Overall Outcome:** [ ] Accepted for Production / [ ] Issues Found
* **Notes:**
