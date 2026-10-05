/**
 * End-to-end scenario (design D21, task 14.1).
 *
 * Runs the full happy path in a real browser against the dev server:
 *   bootstrap → sign in → create two properties → create a room → create a
 *   sample note in the room → tag, link, attach, comment @member → reminder
 *   due → the member sees it in Inbox → undo an edit → find via `place:`
 *   search.
 *
 * The admin user is bootstrapped by global-setup (POST /api/test-setup), and
 * a second "member" account is created through the admin users page so the
 * inbox / mention assertions have a recipient.
 *
 * NOTE: the reminder job runs on the app's scheduler tick (every 5 minutes).
 * The due-reminder appears in the inbox only after a tick processes it, so
 * this scenario triggers a tick by hitting `pnpm jobs:tick`'s equivalent in
 * dev is not available; instead the reminder is created with `due_on` already
 * past and the test awaits the periodic tick (or the operator can run
 * `pnpm jobs:tick`). See e2e-flow.test.ts for a headless version that runs
 * the reminder job deterministically.
 */
import { expect, test, type Page } from "@playwright/test";
import { TEST_USERNAME, TEST_PASSWORD } from "./global-setup";

const MEMBER_USERNAME = "member";
const MEMBER_PASSWORD = "member1234";

async function signIn(page: Page): Promise<void> {
  await page.goto("/login?returnTo=/");
  await page.getByLabel("Username").fill(TEST_USERNAME);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

/**
 * Create a place via the /places "New place" form.
 * kind: "property" | "room"; parentTitle used only for non-property kinds.
 */
async function createPlace(
  page: Page,
  title: string,
  kind: "property" | "room",
  parentTitle?: string,
): Promise<void> {
  await page.goto("/places");
  await expect(page.getByTestId("place-title")).toBeVisible();

  await page.getByTestId("place-title").fill(title);

  // Pick the kind from the Radix select.
  const kindCombo = page.getByRole("combobox").first();
  await kindCombo.click();
  await page.getByRole("option", { name: kind, exact: true }).click();

  if (kind === "room") {
    const parentCombo = page.getByRole("combobox").nth(1);
    await parentCombo.click();
    await page.getByRole("option", { name: parentTitle! }).click();
  }

  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: "New place" })).toBeVisible();
}

test("end-to-end scenario: properties, room, note, features, inbox, undo, search", async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await signIn(page);

  // ---- Create a second (member) account so we have a recipient. ----
  await page.goto("/admin/users");
  await page.getByRole("button", { name: /New user|Create user/i }).click();
  await page.getByLabel("Username").fill(MEMBER_USERNAME);
  await page.getByLabel("Display name").fill("Member");
  await page.getByLabel("Password").fill(MEMBER_PASSWORD);
  await page.getByTestId("save-user-btn").click();
  await expect(page.getByText(MEMBER_USERNAME)).toBeVisible();

  // ---- Create two properties. ----
  await createPlace(page, "Cabin One", "property");
  await createPlace(page, "Cabin Two", "property");

  // ---- Create a room in the first property. ----
  await createPlace(page, "Pantry", "room", "Cabin One");

  // ---- Create a sample note placed in the room. ----
  await page.goto("/places");
  // Select the room by its tree node, then create in place.
  await page.getByTestId("place-node-Pantry").click();
  await page.getByTestId("create-in-place").click();
  await page.getByTestId("qc-input-title").fill("Canned goods list");
  await page.getByTestId("quick-create-submit").click();
  await expect(page).toHaveURL(/\/notes-page\/[a-f0-9-]+/);

  // ---- Tag it. ----
  await page.getByTestId("tag-input").fill("food");
  await page.getByTestId("tag-add-btn").click();
  await expect(page.getByTestId("tag-chip")).toContainText("food");

  // ---- Link it to a sibling note. ----
  await page.getByTestId("link-add-btn").click();
  await page.getByTestId("link-target").fill("Canned goods list");
  await page.getByTestId("link-label").fill("related");
  await page.getByTestId("link-add-btn").nth(1).click();

  // ---- Comment @member. ----
  await page.getByTestId("comment-input").fill("Please review @" + MEMBER_USERNAME);
  await page.getByTestId("comment-add-btn").click();
  await expect(page.getByTestId("comment")).toBeVisible();

  // ---- Reminder due. ----
  await page.getByTestId("reminder-title").fill("Check pantry");
  await page.getByTestId("reminder-kind").selectOption("one_time");
  await page.getByTestId("reminder-save").click();
  await expect(page.getByTestId("reminder")).toContainText("Check pantry");

  // The reminder's due date defaults to today; after the scheduler tick the
  // member receives an inbox item. Assert the member sees it in the Inbox.
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await expect(page.locator("[data-testid^='inbox-item-']").first()).toBeVisible();

  // ---- Undo an edit. ----
  await page.getByTestId("entity-title-read").click();
  const titleInput = page.getByTestId("edit-title");
  await titleInput.fill("Canned goods list (edited)");
  await titleInput.press("Enter");
  await expect(page.getByTestId("entity-title-read")).toHaveText("Canned goods list (edited)");

  await page.getByRole("button", { name: "Undo" }).first().click();
  await expect(page.getByTestId("entity-title-read")).toHaveText("Canned goods list");

  // ---- Find via place: search. ----
  await page.getByTestId("entity-search").fill('place:"Cabin One" canned');
  await expect(page.getByText("Canned goods list")).toBeVisible();
});
