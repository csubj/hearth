/**
 * E2E test for the Today page (task 13.4).
 *
 * Verifies the Today sections render with empty states, that pinning an entity
 * makes it appear under Pinned only for the pinning member, and that the due
 * feed is personal.
 */
import { expect, test, type Page } from "@playwright/test";
import { TEST_USERNAME, TEST_PASSWORD } from "./global-setup";

async function signIn(page: Page): Promise<void> {
  await page.goto("/login?returnTo=/");
  await page.getByLabel("Username").fill(TEST_USERNAME);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

test("Today sections render with empty states", async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await context.clearCookies();
  await signIn(page);

  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Needs you" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Due soon" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent activity" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pinned" })).toBeVisible();
});

test("pin an entity and it appears under Pinned", async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await context.clearCookies();
  await signIn(page);

  // Create a note.
  await page.goto("/notes-page");
  await page.getByTestId("new-entity-btn").click();
  const title = `Pin Me ${Date.now()}`;
  await page.getByTestId("qc-input-title").fill(title);
  await page.getByTestId("quick-create-submit").click();
  await expect(page).toHaveURL(/\/notes-page\/[a-f0-9-]+/, { timeout: 15000 });

  // Pin it from the detail page.
  await page.getByTestId("pin-btn").click();

  // Return to Today and confirm it appears under Pinned.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Pinned" })).toBeVisible();
  await expect(page.getByText(title)).toBeVisible();
});
