/**
 * Server-only oRPC router client (task 3.4, design D3).
 *
 * Server Components read data through this client. It resolves the session
 * context from the current request's cookies/headers (via next/headers) and
 * calls procedures in-process through createRouterClient.
 *
 * This module is marked `server-only` so it can never be imported from a
 * Client Component bundle.
 */

import "server-only";

import { createRouterClient } from "@orpc/server";
import { headers } from "next/headers";
import { router } from "@/server/router";
import { getContext } from "@/server/context";
import { validationInterceptor } from "@/server/orpc";
import type { AppContext } from "@/server/context";

/**
 * Build an AppContext from the current Next.js request. Uses `headers()`
 * to construct a synthetic Request that getContext can resolve.
 */
async function requestContext(): Promise<AppContext> {
  const h = await headers();
  // Build a minimal Request with the current headers so getContext can
  // resolve the session cookie or bearer key.
  const request = new Request("http://localhost", { headers: h });
  return getContext(request);
}

/**
 * Server-side router client for use in Server Components and server-only
 * modules. Each call resolves the caller from the current request context.
 *
 * Usage:
 * ```ts
 * import { serverClient } from "@/lib/orpc-server-client";
 * const result = await serverClient.ping({ echo: "hi" });
 * ```
 */
export const serverClient = createRouterClient(router, {
  context: async () => requestContext(),
  interceptors: [validationInterceptor],
});
