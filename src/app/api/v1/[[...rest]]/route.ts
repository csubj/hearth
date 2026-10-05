/**
 * REST API handler at /api/v1/* (task 3.4, design D3).
 *
 * Uses @orpc/openapi OpenAPIHandler to route requests to oRPC procedures.
 * Authentication is bearer-key ONLY — session cookies are explicitly rejected
 * so there is no CSRF surface.
 *
 * The Idempotency-Key header is captured and threaded into the context so the
 * write pipeline (task 3.3) can use it for idempotent creation.
 *
 * Structured JSON request logs are emitted via logRequest() (task 4.4,
 * design D20) — one line per request with method, route, status, durationMs,
 * requestId, and via.
 */

import { createHash } from "node:crypto";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { router } from "@/server/router";
import { getContext, type AppContext } from "@/server/context";
import {
  validationInterceptor,
  encodeErrorBody,
  ERROR_STATUS_MAP,
} from "@/server/orpc";
import { logRequest } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Standard error response helper
// ---------------------------------------------------------------------------

function errorResponse(
  code: string,
  message: string,
  status: number,
  requestId = "",
): Response {
  return new Response(
    JSON.stringify({
      error: { code, message, requestId },
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

// ---------------------------------------------------------------------------
// Bearer extraction
// ---------------------------------------------------------------------------

const BEARER_RE = /^Bearer\s+(.+)$/i;

function extractBearer(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth) return null;
  const m = BEARER_RE.exec(auth);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// via label helper
// ---------------------------------------------------------------------------

/**
 * Convert ctx.via to a human-readable log label.
 * "web" stays "web"; an API key becomes its name (or "api-key" when unnamed).
 */
function viaLabel(via: AppContext["via"]): string {
  if (via === "web") return "web";
  return via.name ?? "api-key";
}

// ---------------------------------------------------------------------------
// OpenAPI handler instance
// ---------------------------------------------------------------------------

const handler = new OpenAPIHandler(router, {
  clientInterceptors: [validationInterceptor],
  customErrorResponseBodyEncoder: encodeErrorBody,
});

// ---------------------------------------------------------------------------
// Request handler: bearer-only enforcement + context resolution + logging
// ---------------------------------------------------------------------------

async function handle(request: Request): Promise<Response> {
  const startMs = Date.now();
  const { pathname: route } = new URL(request.url);
  const { method } = request;

  /**
   * Emit a structured request log line, then return the response.
   * Called on every exit path so exactly one log line is written per request.
   */
  function finalize(
    response: Response,
    requestId: string,
    via: string,
  ): Response {
    logRequest({
      method,
      route,
      status: response.status,
      durationMs: Date.now() - startMs,
      requestId,
      via,
    });
    return response;
  }

  // Enforce bearer-only: reject requests without a bearer token.
  // A valid session cookie WITHOUT a bearer token is NOT sufficient (spec).
  const bearer = extractBearer(request);
  if (!bearer) {
    return finalize(
      errorResponse(
        "unauthorized",
        "A valid API key is required. Pass Authorization: Bearer <key>.",
        ERROR_STATUS_MAP.unauthorized,
      ),
      "",
      "web",
    );
  }

  // Build context from the bearer key via getContext.
  // getContext handles: key verification, revoked/disabled check, banned owner.
  let ctx: AppContext;
  try {
    ctx = await getContext(request);
  } catch {
    return finalize(
      errorResponse(
        "internal_error",
        "Failed to resolve authentication context.",
        ERROR_STATUS_MAP.internal_error,
      ),
      "",
      "web",
    );
  }

  // If getContext resolved to no user, the key is invalid/revoked/banned.
  if (!ctx.user) {
    return finalize(
      errorResponse(
        "unauthorized",
        "Invalid or revoked API key.",
        ERROR_STATUS_MAP.unauthorized,
        ctx.requestId,
      ),
      ctx.requestId,
      viaLabel(ctx.via),
    );
  }

  // Capture the Idempotency-Key header and thread it into the context.
  // The write pipeline reads `idempotencyKey` / `requestHash` from the
  // context (see write.ts). The body hash lets a replayed key with a
  // different body be rejected as a conflict (design D13).
  const idempotencyKey = request.headers.get("idempotency-key") ?? undefined;
  let requestHash: string | undefined;
  if (idempotencyKey) {
    const bodyText = await request.clone().text();
    requestHash = createHash("sha256").update(bodyText).digest("hex");
  }
  const ctxWithIdempotency = {
    ...ctx,
    idempotencyKey,
    requestHash,
  };

  // Delegate to the OpenAPIHandler
  const result = await handler.handle(request, {
    prefix: "/api/v1",
    context: ctxWithIdempotency,
  });

  if (result.matched) {
    return finalize(result.response, ctx.requestId, viaLabel(ctx.via));
  }

  // No matching procedure
  return finalize(
    errorResponse(
      "not_found",
      "No procedure matches this path.",
      ERROR_STATUS_MAP.not_found,
      ctx.requestId,
    ),
    ctx.requestId,
    viaLabel(ctx.via),
  );
}

// ---------------------------------------------------------------------------
// Next.js App Router exports (all methods)
// ---------------------------------------------------------------------------

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
