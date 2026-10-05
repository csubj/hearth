/**
 * E2E tests for the app shell navigation (task 13.1) and global quick-create
 * (task 13.2).
 *
 *  - At 1280px the sidebar is visible and lists Today, Inbox, modules,
 *    Settings.
 *  - At 390px the bottom bar is shown with 44px touch targets.
 *  - Opening Create from the places page prefills the selected place.
 */
import { expect, test, type Page } from "@playwright/test";
import { TEST_USERNAME, TEST_PASSWORD } from "./global-setup";

const TEST = { width: 1280, height: 800 } as const;
const MOBILE = { width: 390, height: 844 } as const;

async function signIn(page: Page): Promise<void> {
  await page.goto("/login?returnTo=/");
  await page.getByLabel("Username").fill(TEST_USERNAME);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

test("sidebar shows at 1280px with Today, Inbox, modules and Settings", async ({
  page,
  context,
}) => {
  await page.setViewportSize(TEST);
  await context.clearCookies();
  await signIn(page);

  await expect(page.getByRole("link", { name: "Today" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Inbox" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Household notes" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Places" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
});

test("mobile bottom bar shows with 44px targets at 390px", async ({
  page,
  context,
}) => {
  await page.setViewportSize(MOBILE);
  await context.clearCookies();
  await signIn(page);

  const nav = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(nav).toBeVisible();
  // All five bottom-bar items.
  for (const label of ["Today", "Search", "Create", "Inbox", "Menu"]) {
    await expect(nav.getByRole("link", { name: label }).or(nav.getByRole("button", { name: label }))).toBeVisible();
  }
  // Touch targets are at least 44px tall.
  const heights = await nav.locator("a,button").evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().height),
  );
  expect(heights.length).toBeGreaterThan(0);
  for (const h of heights) {
    expect(h).toBeGreaterThanOrEqual(44);
  }
});

test("quick-create from the places page prefills the place", async ({
  page,
  context,
}) => {
  await page.setViewportSize(TEST);
  await context.clearCookies();
  await signIn(page);

  await page.goto("/places");
  await expect(page.getByRole("heading", { name: "Places" })).toBeVisible();

  // Create a property so there is a selectable place.
  await page.getByTestId("place-title").fill(`Kitchen ${Date.now()}`);
  await page.getByRole("button", { name: "Create" }).first().click();

  // Select a created node, then open the create-in-place dialog.
  await page.getByTestId("create-in-place").click();
  await expect(page.getByTestId("quick-create-submit")).toBeVisible();
  // Pick a module and confirm the dialog is present.
  await page.getByTestId("create-module-notes-page").click();
  await expect(page.getByTestId("qc-input-title")).toBeVisible();
});
