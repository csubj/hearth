"use server";

/**
 * Generic server action that calls any oRPC procedure by dot-path (task 3.4).
 *
 * Design D3: `invoke(path, input)` resolves the procedure from the router,
 * calls it with the session context, returns `[error, data]`, and calls
 * `refresh()` after a successful write so Server Components re-render.
 *
 * Thrown errors NEVER cross the action boundary — they are caught and
 * returned as the standardised error object.
 */

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { createRouterClient } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import { router, type AppRouter } from "@/server/router";
import { getContext, type AppContext } from "@/server/context";
import { validationInterceptor } from "@/server/orpc";
import type { ErrorDetail } from "@/server/orpc";

// ---------------------------------------------------------------------------
// Error shape returned to the client
// ---------------------------------------------------------------------------

/** The error object returned as the first element of [error, data]. */
export interface InvokeError {
  code: string;
  message: string;
  details?: ErrorDetail[];
  requestId: string;
}

export type InvokeResult<T> = [error: InvokeError, data: undefined] | [error: null, data: T];

// ---------------------------------------------------------------------------
// Context builder (mirrors orpc-server-client but in the action context)
// ---------------------------------------------------------------------------

async function requestContext(): Promise<AppContext> {
  const h = await headers();
  const request = new Request("http://localhost", { headers: h });
  return getContext(request);
}

// ---------------------------------------------------------------------------
// Path → procedure resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a nested procedure from the router by a dot-separated path.
 * E.g. "echo" → router.echo, "some.nested" → router.some.nested.
 */
function resolveProcedure(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ---------------------------------------------------------------------------
// invoke — the server action
// ---------------------------------------------------------------------------

/**
 * Call any procedure by its dot-path and return `[error, data]`.
 *
 * After a successful mutation (POST/non-GET procedures), `refresh()` is
 * called so Server Components re-render with fresh data in the same
 * round trip.
 */
export async function invoke(
  path: string,
  input: unknown,
): Promise<InvokeResult<unknown>> {
  try {
    const ctx = await requestContext();

    // Create a client scoped to this request context
    const client = createRouterClient(router, {
      context: ctx,
      interceptors: [validationInterceptor],
    });

    // Resolve the procedure function from the client by path
    const proc = resolveProcedure(client as Record<string, unknown>, path);
    if (typeof proc !== "function") {
      return [
        {
          code: "not_found",
          message: `Procedure "${path}" not found.`,
          requestId: ctx.requestId,
        },
        undefined,
      ];
    }

    const data = await (proc as (input: unknown) => Promise<unknown>)(input);

    // Call refresh() so Server Components re-render with fresh data.
    // This is safe to call unconditionally — for reads it's a no-op in
    // practice since nothing changed.
    refresh();

    return [null, data];
  } catch (err) {
    // ORPCError (already normalized by validationInterceptor)
    if (err instanceof ORPCError) {
      const data =
        typeof err.data === "object" && err.data !== null
          ? (err.data as Record<string, unknown>)
          : {};
      return [
        {
          code: err.code,
          message: err.message,
          details: data.details as ErrorDetail[] | undefined,
          requestId: (data.requestId as string) ?? "",
        },
        undefined,
      ];
    }

    // Completely unknown error — should not happen if the interceptor is wired,
    // but be defensive.
    console.error("[invoke] unexpected error:", err);
    return [
      {
        code: "internal_error",
        message: "An unexpected error occurred.",
        requestId: "",
      },
      undefined,
    ];
  }
}

// ---------------------------------------------------------------------------
// Typed client helper (design D3)
// ---------------------------------------------------------------------------

/**
 * Dot-path keys from the AppRouter type, supporting one level of nesting.
 * Expand if deeper nesting is needed in the future.
 */
type RouterPaths<R> = {
  [K in keyof R & string]: R[K] extends Record<string, unknown>
    ? `${K}.${keyof R[K] & string}`
    : K;
}[keyof R & string];

/**
 * Extract the procedure at a given dot-path from the router type.
 */
type ProcedureAt<R, P extends string> = P extends `${infer A}.${infer B}`
  ? A extends keyof R
    ? B extends keyof R[A]
      ? R[A][B]
      : never
    : never
  : P extends keyof R
    ? R[P]
    : never;

/**
 * Infer the input type for a procedure (works with oRPC's Procedure type).
 */
type InferInput<T> = T extends { "~orpc": { inputSchema: infer S } }
  ? S extends { _zod: { input: infer I } }
    ? I
    : unknown
  : unknown;

/**
 * Infer the output type for a procedure handler.
 */
type InferOutput<T> = T extends { "~orpc": { handler: (...args: never[]) => infer O } }
  ? Awaited<O>
  : unknown;

/**
 * Typed invoke helper. Provides type inference for procedure input and output
 * based on the router type. Client Components use this for type safety.
 *
 * Usage:
 * ```ts
 * const [error, data] = await typedInvoke("echo", { message: "hi" });
 * //    ^? InvokeError | null        ^? { message: string; requestId: string }
 * ```
 */
export async function typedInvoke<
  P extends RouterPaths<AppRouter>,
>(
  path: P,
  input: InferInput<ProcedureAt<AppRouter, P>>,
): Promise<InvokeResult<InferOutput<ProcedureAt<AppRouter, P>>>> {
  return invoke(path, input) as Promise<
    InvokeResult<InferOutput<ProcedureAt<AppRouter, P>>>
  >;
}
