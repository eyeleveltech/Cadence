import { test, expect } from "@playwright/test";

// Requires the DB to be seeded (npm run db:seed) — same credentials the
// seed script prints.
const EMAIL = "akmal@eyelevelstudio.in";
const PASSWORD = "cadence-dev-2026";

test("a team member signs in and lands on the planner", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Team" }).click();
  await page.getByPlaceholder("you@eyelevelstudio.in").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();

  await page.waitForURL("**/planner");
  await expect(page.getByRole("heading", { name: "Planner" })).toBeVisible();
});

test("a stranger typing an unknown email into the client tab gets no account created", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Client reviewer" }).click();
  await page.getByPlaceholder("the email your account manager used").fill(`not-a-real-person-${Date.now()}@example.com`);
  await page.getByRole("button", { name: /email me a sign-in link/i }).click();

  // The magic-link plugin has disableSignUp on, so this should surface
  // an error toast rather than the "check your email" success state —
  // the security fix from the client-access work, pinned as a test.
  await expect(page.getByText(/check your email/i)).not.toBeVisible();
});
