/**
 * OpenAPI document generation (design D5, task 6.6).
 *
 * Walks the same root router the handlers serve, using `OpenAPIGenerator`
 * with the Zod JSON Schema converter, so the document's field schemas and the
 * custom error body schema are concrete (no generic placeholder objects).
 *
 * Both `/api/openapi.json` and `/api/docs` (Scalar) are public.
 */

import "server-only";

import * as z from "zod";
import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { router } from "./router";

// ---------------------------------------------------------------------------
// Shared error body schema (service-api spec: Error model)
// ---------------------------------------------------------------------------

/**
 * The canonical error response body: `{ error: { code, message, details?,
 * requestId } }`. Declared once and injected into the OpenAPI document as a
 * reusable component so its schema has concrete types.
 */
export const errorBodySchema = z.object({
  error: z.object({
    /** One of the known AppErrorCode values, e.g. "validation_error". */
    code: z.string(),
    message: z.string(),
    /** Field-level details, present only for validation errors. */
    details: z
      .array(
        z.object({
          path: z.string(),
          message: z.string(),
        }),
      )
      .optional(),
    requestId: z.string(),
  }),
});

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

const generator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

/** The OpenAPI info block. */
const OPENAPI_INFO = {
  title: "hearth API",
  version: "1.0.0",
  description:
    "hearth household coordination API. Authenticate with " +
    "`Authorization: Bearer <api-key>`. Every operation is shared by the web " +
    "UI and REST; responses and errors are identical.",
};

/**
 * Injected JSON schema for the error body, used whenever a procedure declares
 * an error response so the document shows the exact spec-defined shape.
 */
function errorResponseBodySchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      error: {
        type: "object",
        properties: {
          code: { type: "string" },
          message: { type: "string" },
          details: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "string" },
                message: { type: "string" },
              },
              required: ["path", "message"],
            },
          },
          requestId: { type: "string" },
        },
        required: ["code", "message", "requestId"],
      },
    },
    required: ["error"],
  };
}

// ---------------------------------------------------------------------------
// Cached generation
// ---------------------------------------------------------------------------

let cachedDoc: Promise<unknown> | null = null;

/**
 * Generate (and cache) the OpenAPI document from the root router.
 *
 * `commonSchemas.ErrorBody` ensures the error body appears in
 * `components.schemas` with concrete types even when no procedure currently
 * declares a typed error union. `customErrorResponseBodySchema` keeps future
 * declared-error responses aligned with the same shape.
 */
export function generateOpenApiDoc(): Promise<unknown> {
  if (!cachedDoc) {
    cachedDoc = generator.generate(router, {
      info: OPENAPI_INFO,
      servers: [{ url: "/api/v1" }],
      customErrorResponseBodySchema: errorResponseBodySchema,
      commonSchemas: {
        ErrorBody: { schema: errorBodySchema, strategy: "output" },
      },
    });
  }
  return cachedDoc;
}
