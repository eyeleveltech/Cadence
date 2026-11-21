import { test, expect } from "@playwright/test";

// Requires the DB to be seeded (npm run db:seed) — same credentials the seed script prints.
const EMAIL = "akmal@eyelevelstudio.in";
const PASSWORD = "cadence-dev-2026";

test.describe("Editorial Workflow & Public Routes", () => {
  test("unauthenticated visitor can reach /set-password without being redirected to /login", async ({ page }) => {
    // Navigate directly to the password setup page without an active session
    await page.goto("/set-password?token=mock_test_token");

    // Must not be redirected by middleware to /login
    await expect(page).toHaveURL(/\/set-password/);

    // Should render the public password setup container (invalid link alert for fake token)
    await expect(page.getByText(/Invalid or Expired Link/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Return to Sign In/i })).toBeVisible();
  });

  test("staff member can sign in, enter client workspace, and navigate editorial plan", async ({ page }) => {
    // 1. Sign in as an internal agency staff member
    await page.goto("/login");
    await page.getByRole("tab", { name: "Team" }).click();
    await page.getByPlaceholder("you@eyelevelstudio.in").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    // 2. Validate arrival on the personal planner overview
    await page.waitForURL("**/planner");
    await expect(page.getByRole("heading", { name: /Hello,/i })).toBeVisible();

    // 3. Open the first available client workspace
    const clientLink = page.locator('a[href^="/clients/"]').first();
    await expect(clientLink).toBeVisible();
    await clientLink.click();

    // 4. Validate arrival at client plan view
    await page.waitForURL(/\/clients\/[^/]+\/plan/);
    await expect(page.getByRole("button", { name: "Calendar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Board" })).toBeVisible();

    // 5. Switch to Kanban Board view
    await page.getByRole("button", { name: "Board" }).click();
    await expect(page.getByText("Idea", { exact: false })).toBeVisible();
    await expect(page.getByText("In writing", { exact: false })).toBeVisible();
  });

  test("staff member can inspect a post and view review/advance controls", async ({ page }) => {
    // 1. Sign in
    await page.goto("/login");
    await page.getByRole("tab", { name: "Team" }).click();
    await page.getByPlaceholder("you@eyelevelstudio.in").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL("**/planner");

    // 2. Click a client card to navigate into the workspace plan
    const clientLink = page.locator('a[href^="/clients/"]').first();
    await expect(clientLink).toBeVisible();
    await clientLink.click();
    await page.waitForURL(/\/clients\/[^/]+\/plan/);

    // 3. Navigate into Board view to find an existing post card
    await page.getByRole("button", { name: "Board" }).click();

    // Find any post card rendered in the columns
    const firstPostCard = page.locator(".cursor-grab").first();
    const hasPost = await firstPostCard.isVisible().catch(() => false);

    if (hasPost) {
      // 4. Open post editor
      await firstPostCard.click();
      await page.waitForURL(/\/posts\/[^/]+/);

      // Verify core editorial controls are rendered
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByText("Platforms")).toBeVisible();
      await expect(page.getByText("Content")).toBeVisible();
      await expect(page.getByText("Approval & Notes")).toBeVisible();

      // Check if an Advance button exists for valid status transitions
      const advanceButton = page.getByRole("button", { name: /Advance →/i });
      if (await advanceButton.isVisible().catch(() => false)) {
        await expect(advanceButton).toBeEnabled();
      }
    }
  });
});

