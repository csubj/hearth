/**
 * Public OpenAPI document (design D5, task 6.6).
 *
 * Serves the JSON generated from the root router at `GET /api/openapi.json`.
 * Public — no bearer or session required.
 */

import { generateOpenApiDoc } from "@/server/openapi";

export async function GET(): Promise<Response> {
  const doc = await generateOpenApiDoc();
  return new Response(JSON.stringify(doc), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
