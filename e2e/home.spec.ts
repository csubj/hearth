/**
 * Smoke tests for the signed-in home (Today) page (task 13.4).
 *
 * The authenticated home page is the Today overview. These tests sign in and
 * verify the Today sections render (with empty states) and that the app shell
 * sidebar is present.
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

test("home page renders the Today overview sections", async ({ page, context }) => {
  await context.clearCookies();
  await signIn(page);

  await expect(page.getByRole("heading", { name: "hearth" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Needs you" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Due soon" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent activity" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pinned" })).toBeVisible();
});

test("sidebar lists modules and a Create button", async ({ page, context }) => {
  await context.clearCookies();
  await signIn(page);

  await expect(page.getByRole("link", { name: "Today" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Inbox" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Household notes" })).toBeVisible();
  await expect(page.getByTestId("create-btn")).toBeVisible();
});
