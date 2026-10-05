/**
 * Playwright global setup: ensure a test admin user exists before the tests
 * run. Calls the dev-only POST /api/test-setup endpoint which bootstraps an
 * admin or returns success if one already exists.
 */
import type { FullConfig } from "@playwright/test";

export const TEST_USERNAME = "admin";
export const TEST_PASSWORD = "admin1234";

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    config.projects[0]?.use?.baseURL ?? "http://localhost:3000";

  const res = await fetch(`${baseURL}/api/test-setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: TEST_USERNAME, password: TEST_PASSWORD }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`test-setup failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { ok: boolean; error?: string };
  if (!data.ok) {
    throw new Error(`test-setup returned error: ${data.error}`);
  }
}
