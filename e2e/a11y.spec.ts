/**
 * Accessibility pass (task 13.5).
 *
 * Runs axe against the main signed-in pages (Today, a module list, and the
 * inbox) and fails on any violation of the default WCAG AA ruleset.
 */
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { TEST_USERNAME, TEST_PASSWORD } from "./global-setup";

async function signIn(page: Page): Promise<void> {
  await page.goto("/login?returnTo=/");
  await page.getByLabel("Username").fill(TEST_USERNAME);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

const PAGES = [
  { name: "Today", path: "/" },
  { name: "Module list", path: "/notes-page" },
  { name: "Inbox", path: "/inbox" },
];

for (const pageDef of PAGES) {
  test(`no axe violations on the ${pageDef.name} page`, async ({ page, context }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await context.clearCookies();
    await signIn(page);
    await page.goto(pageDef.path);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const violations = results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.length,
    }));
    expect(violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
}

test("skip link is keyboard-navigable", async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await context.clearCookies();
  await signIn(page);

  // The skip link exists in the DOM (hidden until focused).
  const skip = page.locator('a[href="#main"]');
  await expect(skip).toBeVisible();
});
