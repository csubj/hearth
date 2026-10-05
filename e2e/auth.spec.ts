/**
 * E2E tests for task 2.3: login page, proxy auth gate, and sign-in behavior.
 *
 * Scenarios covered:
 *   1. Unauthenticated visit to an app page → redirect to /login?returnTo=<path>
 *   2. Wrong password → stay on /login with a generic error message
 *   3. Correct credentials → land on the returnTo path with a session cookie
 */
import { expect, test } from "@playwright/test";
import { TEST_USERNAME, TEST_PASSWORD } from "./global-setup";

// ---------------------------------------------------------------------------
// Scenario 1: anonymous page request is redirected by the proxy
// ---------------------------------------------------------------------------
test("unauthenticated visit to / redirects to /login?returnTo=/", async ({
  page,
  context,
}) => {
  // Ensure no session cookies are present.
  await context.clearCookies();

  await page.goto("/", { waitUntil: "load" });

  // The proxy redirects to /login; follow it.
  await expect(page).toHaveURL(/\/login\?returnTo=%2F|\/login\?returnTo=\//);
  await expect(page.getByRole("heading", { name: "hearth" })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 2: wrong credentials show a generic error, stay on /login
// ---------------------------------------------------------------------------
test("wrong password shows generic error and stays on /login", async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await page.goto("/login");

  await page.getByLabel("Username").fill(TEST_USERNAME);
  await page.getByLabel("Password").fill("wrongpassword999");
  await page.getByRole("button", { name: "Sign in" }).click();

  // Must stay on /login
  await expect(page).toHaveURL(/\/login/);

  // Generic error — must NOT mention "username" or "password" specifically.
  // Use a filter to skip Next.js's built-in route-announcer element.
  const alert = page
    .getByRole("alert")
    .filter({ hasText: /Invalid username or password/ });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("Invalid username or password");
});

// ---------------------------------------------------------------------------
// Scenario 3: correct credentials redirect to returnTo and set session cookie
// ---------------------------------------------------------------------------
test("successful sign-in lands on returnTo path and sets session cookie", async ({
  page,
  context,
}) => {
  await context.clearCookies();

  // Navigate to /login with a returnTo pointing back to /.
  await page.goto("/login?returnTo=/");

  await page.getByLabel("Username").fill(TEST_USERNAME);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Should be redirected to / after successful sign-in.
  await expect(page).toHaveURL("/");

  // A session cookie must now exist.
  const cookies = await context.cookies();
  const sessionCookie = cookies.find(
    (c) =>
      c.name === "better-auth.session_token" ||
      c.name === "__Secure-better-auth.session_token",
  );
  expect(sessionCookie).toBeDefined();
  expect(sessionCookie?.httpOnly).toBe(true);
});
