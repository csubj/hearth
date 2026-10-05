/**
 * Public GET /api/health (design D20, task 4.3).
 *
 * Returns:
 *  200  { ok: true,  checks: { database, scheduler, jobs } }  when healthy
 *  503  { ok: false, checks: { ... } }                        when a check fails
 *
 * The response MUST NOT contain household data (no entity/user titles).
 * No auth required — the auth proxy excludes /api/* routes.
 */

import { getHealthResult } from "@/server/health";

export async function GET(): Promise<Response> {
  let result;
  try {
    result = getHealthResult();
  } catch (err) {
    // Connection not yet initialized (e.g. called before instrumentation runs).
    const message =
      err instanceof Error ? err.message : "health check unavailable";
    result = {
      ok: false,
      checks: {
        database: { ok: false, message },
        scheduler: { ok: false, message: "not initialized" },
        jobs: { ok: false, failing: [] as string[] },
      },
    };
  }

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 503,
    headers: { "Content-Type": "application/json" },
  });
}
