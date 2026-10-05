/**
 * Development-only test-setup route.
 *
 * Called by the Playwright global setup to ensure a known test user exists.
 * Returns 404 in production so it is never reachable in deployed instances.
 *
 * POST body: { username: string; password: string }
 * Response: { ok: true } or { ok: false; error: string }
 */

import { bootstrapAdmin, BootstrapError } from "@/server/auth/bootstrap";

export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not Found", { status: 404 });
  }

  let body: { username?: string; password?: string };
  try {
    body = await request.json() as { username?: string; password?: string };
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { username, password } = body;
  if (typeof username !== "string" || typeof password !== "string") {
    return Response.json(
      { ok: false, error: "username and password are required" },
      { status: 400 },
    );
  }

  // Set env vars that bootstrapAdmin reads.
  process.env.ADMIN_USERNAME = username;
  process.env.ADMIN_PASSWORD = password;

  try {
    await bootstrapAdmin();
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof BootstrapError && err.message.startsWith("Bootstrap refused")) {
      // User already exists — treat as success so tests can reuse the user.
      return Response.json({ ok: true, message: "user already exists" });
    }
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
