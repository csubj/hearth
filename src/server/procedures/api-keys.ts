/**
 * API key management procedures (task 5.3).
 *
 * All procedures are sessionOnly: API-key callers get 403 on all of these
 * (design D6, spec: "API keys cannot manage accounts").
 *
 * Uses Better Auth's `auth.api.createApiKey`, `auth.api.listApiKeys`, and
 * `auth.api.deleteApiKey` plugin methods. The full secret is returned ONCE
 * at creation; only a hash is stored. `lastRequest` is updated by the
 * plugin's verifyApiKey on each use. Revoke deletes the row, so verifyApiKey
 * returns `valid: false` → context.ts resolves `user: null` → 401.
 */

import * as z from "zod";
import { ORPCError } from "@orpc/server";

import { sessionOnly, ERROR_STATUS_MAP } from "../orpc";
import { auth } from "../auth";

// ---------------------------------------------------------------------------
// listApiKeys (member + sessionOnly)
// ---------------------------------------------------------------------------

export const listApiKeys = sessionOnly
  .route({ method: "GET", path: "/account/api-keys" })
  .input(z.object({}))
  .handler(async ({ context }) => {
    const userId = context.user.id;

    // Use the adapter to list keys for this user directly,
    // since we've already authenticated through our sessionOnly middleware.
    const ctx = await auth.$context;
    const rows = await ctx.adapter.findMany({
      model: "apikey",
      where: [{ field: "referenceId", value: userId }],
      sortBy: { field: "createdAt", direction: "desc" },
    });

    return {
      keys: (rows ?? []).map((value: unknown) => {
        const row = value as Record<string, unknown>;
        return {
          id: row.id as string,
          name: (row.name as string | null) ?? null,
          start: (row.start as string | null) ?? null,
          prefix: (row.prefix as string | null) ?? null,
          createdAt: row.createdAt as string | Date,
          lastRequest: (row.lastRequest as string | Date | null) ?? null,
          enabled: row.enabled as boolean,
          expiresAt: (row.expiresAt as string | Date | null) ?? null,
        };
      }),
    };
  });

// ---------------------------------------------------------------------------
// createApiKey (member + sessionOnly)
// ---------------------------------------------------------------------------

export const createApiKey = sessionOnly
  .route({ method: "POST", path: "/account/api-keys" })
  .input(
    z.object({
      name: z.string().min(1, "Name is required").max(32),
    }),
  )
  .handler(async ({ context, input }) => {
    const userId = context.user.id;

    // Call the Better Auth plugin's createApiKey with the userId (server-only param).
    // This creates the key, hashes it, stores the hash, and returns the full secret once.
    try {
      const result = await auth.api.createApiKey({
        body: {
          name: input.name,
          userId,
        },
      });

      return {
        id: result.id as string,
        name: result.name as string | null,
        start: result.start as string | null,
        prefix: result.prefix as string | null,
        key: result.key as string, // full secret — shown only once
        createdAt: result.createdAt as string | Date,
        expiresAt: (result.expiresAt as string | Date | null) ?? null,
      };
    } catch (err: unknown) {
      // Map Better Auth errors to our error codes
      const message =
        err instanceof Error ? err.message : "Failed to create API key.";

      // Check for name-related errors
      if (message.includes("NAME") || message.includes("name")) {
        throw new ORPCError("validation_error", {
          status: ERROR_STATUS_MAP.validation_error,
          message: `Invalid API key name: ${message}`,
        });
      }

      throw new ORPCError("internal_error", {
        status: ERROR_STATUS_MAP.internal_error,
        message: "Failed to create API key.",
      });
    }
  });

// ---------------------------------------------------------------------------
// revokeApiKey (member + sessionOnly)
// ---------------------------------------------------------------------------

export const revokeApiKey = sessionOnly
  .route({ method: "POST", path: "/account/api-keys/revoke" })
  .input(
    z.object({
      keyId: z.string().min(1, "Key ID is required"),
    }),
  )
  .handler(async ({ context, input }) => {
    const userId = context.user.id;

    // Look up the key to verify ownership before deleting.
    const ctx = await auth.$context;
    const existing = await ctx.adapter.findOne({
      model: "apikey",
      where: [
        { field: "id", value: input.keyId },
        { field: "referenceId", value: userId },
      ],
    });

    if (!existing) {
      throw new ORPCError("not_found", {
        status: ERROR_STATUS_MAP.not_found,
        message: "API key not found.",
      });
    }

    // Delete the key row. After this, verifyApiKey returns valid: false → 401.
    await ctx.adapter.delete({
      model: "apikey",
      where: [{ field: "id", value: input.keyId }],
    });

    return { ok: true };
  });
