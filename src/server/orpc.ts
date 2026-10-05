/**
 * oRPC base for hearth (task 3.2).
 *
 * Exports:
 *  - ERROR_STATUS_MAP  — error code → HTTP status mapping (D3)
 *  - base              — os builder scoped to AppContext
 *  - member            — requires active user (401 if not)
 *  - admin             — requires admin role (403 if not)
 *  - sessionOnly       — rejects API-key callers (403)
 *  - entityAccess(f?)  — loads entity by id, 404 if missing/trashed (stub for task 6.2)
 *  - validationInterceptor — maps BAD_REQUEST → validation_error, unknown → internal_error
 *  - encodeErrorBody   — REST error body encoder for OpenAPIHandler (task 3.4)
 */

import { os, ORPCError, ValidationError } from "@orpc/server";
import type { MiddlewareOptions } from "@orpc/server";
import type { AppContext } from "./context";
import { db } from "../db";
import { entities } from "../db/schema";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Error codes and HTTP status mapping (D3, service-api spec)
// ---------------------------------------------------------------------------

/**
 * Our canonical error codes with their HTTP status equivalents.
 * Procedures throw ORPCError with one of these codes plus an explicit status.
 */
export const ERROR_STATUS_MAP = {
  validation_error: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal_error: 500,
} as const;

export type AppErrorCode = keyof typeof ERROR_STATUS_MAP;

// ---------------------------------------------------------------------------
// Base builder (D3)
// ---------------------------------------------------------------------------

/** oRPC builder scoped to the per-request AppContext. */
export const base = os.$context<AppContext>();

// ---------------------------------------------------------------------------
// Middleware (D3): authorization lives ONLY here
// ---------------------------------------------------------------------------

/**
 * `member` — requires an active (non-null) user.
 * Throws unauthorized (401) for unauthenticated contexts.
 * Narrows context.user to non-null for downstream middleware/handlers.
 */
export const member = base.use(({ context, next }) => {
  if (!context.user) {
    throw new ORPCError("unauthorized", {
      status: ERROR_STATUS_MAP.unauthorized,
      message: "Authentication required.",
    });
  }
  // Narrow: user is non-null after this point.
  const user = context.user;
  return next({ context: { user } });
});

/**
 * `admin` — requires member + admin role.
 * Throws forbidden (403) when the user lacks the admin role.
 */
export const admin = member.use(({ context, next }) => {
  if (context.user.role !== "admin") {
    throw new ORPCError("forbidden", {
      status: ERROR_STATUS_MAP.forbidden,
      message: "Admin role required.",
    });
  }
  return next();
});

/**
 * `sessionOnly` — requires member + browser-session channel.
 * Rejects API-key callers (via !== 'web') with forbidden (403).
 * Used for admin pages, API-key management, and password change.
 */
export const sessionOnly = member.use(({ context, next }) => {
  if (typeof context.via !== "string") {
    // via is { apiKeyId, name } → API key caller
    throw new ORPCError("forbidden", {
      status: ERROR_STATUS_MAP.forbidden,
      message: "This action requires a browser session.",
    });
  }
  return next();
});

/**
 * `entityAccess(feature?)` — loads the target entity by id/entityId from
 * the procedure input and returns not_found (404) if it is missing or trashed.
 *
 * The `feature` check (forbidden if the module does not enable the feature)
 * will be completed in task 6.2 when the module registry exists. For now it
 * is a no-op but the error semantics are defined.
 *
 * Usage: `member.use(entityAccess()).input(...).handler(...)`
 */
export function entityAccess(feature?: string) {
  // feature reserved for task 6.2
  void feature;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async ({ next }: MiddlewareOptions<AppContext, unknown, any, any>, input: unknown) => {
    if (input !== null && typeof input === "object") {
      const raw = input as Record<string, unknown>;
      const id = raw.id ?? raw.entityId;
      if (typeof id === "string") {
        const entity = db.select().from(entities).where(eq(entities.id, id)).get();
        if (!entity || entity.deletedAt !== null) {
          throw new ORPCError("not_found", {
            status: ERROR_STATUS_MAP.not_found,
            message: "Entity not found.",
          });
        }
        // task 6.2: check that module enables `feature`; throw forbidden if not
      }
    }
    return next();
  };
}

// ---------------------------------------------------------------------------
// Validation interceptor (D3)
// ---------------------------------------------------------------------------

/**
 * oRPC client interceptor that normalises errors into our error model.
 *
 * - oRPC input-validation failure (BAD_REQUEST + ValidationError cause)
 *   → ORPCError("validation_error") with `details[{ path, message }]`
 * - Any other ORPCError passes through unchanged but with requestId injected
 *   into `data` so the REST encoder can read it.
 * - Unknown (non-ORPCError) errors → ORPCError("internal_error") with a
 *   generic message; the full error is logged with the requestId.
 *
 * Pass as `interceptors: [validationInterceptor]` to `createRouterClient`
 * and as `clientInterceptors: [validationInterceptor]` to StandardHandlerOptions.
 */
export const validationInterceptor = async (
  options: {
    context: AppContext;
    next: () => Promise<unknown>;
    [key: PropertyKey]: unknown;
  },
): Promise<unknown> => {
  const { context, next } = options;
  try {
    return await next();
  } catch (err) {
    // ---- Validation error from oRPC input validation ----
    if (
      err instanceof ORPCError &&
      err.code === "BAD_REQUEST" &&
      err.cause instanceof ValidationError
    ) {
      const rawIssues =
        (
          err.data as {
            issues?: Array<{ path?: Array<string | number>; message?: string }>;
          } | null
        )?.issues ?? [];
      const details: ErrorDetail[] = rawIssues.map((issue) => ({
        path: (issue.path ?? []).map(String).join("."),
        message: issue.message ?? "Invalid value",
      }));
      throw new ORPCError("validation_error", {
        status: ERROR_STATUS_MAP.validation_error,
        message: "Validation failed.",
        data: { details, requestId: context.requestId },
      });
    }

    // ---- Known ORPCError: inject requestId into data ----
    if (err instanceof ORPCError) {
      const prevData =
        typeof err.data === "object" && err.data !== null
          ? (err.data as Record<string, unknown>)
          : {};
      throw new ORPCError(err.code, {
        status: err.status,
        message: err.message,
        data: { ...prevData, requestId: context.requestId },
        cause: err.cause,
      });
    }

    // ---- Unknown error: log and convert to internal_error ----
    console.error(`[${context.requestId}] Internal error:`, err);
    throw new ORPCError("internal_error", {
      status: ERROR_STATUS_MAP.internal_error,
      message: "An unexpected error occurred.",
      data: { requestId: context.requestId },
    });
  }
};

// ---------------------------------------------------------------------------
// Error body encoder (D3, service-api spec)
// ---------------------------------------------------------------------------

/** A single validation-error field detail. */
export interface ErrorDetail {
  path: string;
  message: string;
}

/** The REST error response body (service-api spec: Error model). */
export interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: ErrorDetail[];
    requestId: string;
  };
}

/**
 * `customErrorResponseBodyEncoder` for the OpenAPIHandler (task 3.4).
 *
 * Reads `code`, `message`, `data.details`, and `data.requestId` from an
 * ORPCError and emits the spec-defined `{ error: { code, message, details?,
 * requestId } }` shape.
 */
export function encodeErrorBody(error: ORPCError<string, unknown>): ErrorResponseBody {
  const data =
    typeof error.data === "object" && error.data !== null
      ? (error.data as Record<string, unknown>)
      : {};
  return {
    error: {
      code: error.code,
      message: error.message,
      details: data.details as ErrorDetail[] | undefined,
      requestId: (data.requestId as string) ?? "",
    },
  };
}
