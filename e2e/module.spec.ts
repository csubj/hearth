/**
 * E2E test for task 13.3: Shared registry-driven module list and detail.
 *
 * Proves the notes-page sample module is usable in the browser:
 *   1. Navigate to /notes-page → generic list page renders
 *   2. Create a note with title + category via the QuickCreate dialog
 *   3. See the note in the list
 *   4. Click through to the detail page
 *   5. Edit the title inline, save via invoke with expectedVersion
 *   6. Confirm the change is visible
 *   7. Navigate to a non-module path → 404
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

test("notes-page list page renders with heading", async ({ page, context }) => {
  await context.clearCookies();
  await signIn(page);

  await page.goto("/notes-page");
  await expect(page.getByRole("heading", { name: "Household notes" })).toBeVisible();
  await expect(page.getByTestId("new-entity-btn")).toBeVisible();
});

test("non-module path returns 404", async ({ page, context }) => {
  await context.clearCookies();
  await signIn(page);

  const response = await page.goto("/not-a-real-module");
  expect(response?.status()).toBe(404);
});

test("create a note, see it in the list, open detail, edit and save", async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await signIn(page);

  await page.goto("/notes-page");
  await expect(page.getByRole("heading", { name: "Household notes" })).toBeVisible();

  // Open the quick-create dialog.
  await page.getByTestId("new-entity-btn").click();
  await expect(page.getByTestId("quick-create-submit")).toBeVisible();

  // Fill in title and category.
  const title = `Test Note ${Date.now()}`;
  await page.getByTestId("qc-input-title").fill(title);
  await page.getByTestId("qc-input-category").selectOption("reference");

  await page.getByTestId("quick-create-submit").click();
  await expect(page).toHaveURL(/\/notes-page\/[a-f0-9-]+/, { timeout: 15000 });
  await expect(page.getByTestId("entity-title-read")).toHaveText(title);

  // Go back to list and verify the note appears.
  await page.goto("/notes-page");
  await expect(page.getByText(title)).toBeVisible();

  // Click into the detail page from the list.
  await page.getByText(title).click();
  await expect(page).toHaveURL(/\/notes-page\/[a-f0-9-]+/);

  // Edit the title inline: click the read-only title, clear, type, Enter.
  const newTitle = `Edited Note ${Date.now()}`;
  await page.getByTestId("entity-title-read").click();
  const titleInput = page.getByTestId("edit-title");
  await titleInput.clear();
  await titleInput.fill(newTitle);
  await titleInput.press("Enter");

  // Verify the title updated inline.
  await expect(page.getByTestId("entity-title-read")).toHaveText(newTitle);

  // Verify version incremented (at least 2 after create + update).
  const versionText = await page.getByTestId("entity-version").textContent();
  expect(Number(versionText)).toBeGreaterThanOrEqual(2);
});
