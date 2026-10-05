/**
 * Self-service account settings procedures (task 5.2).
 *
 * Read procedures use `member` (API keys allowed for reads).
 * Mutation procedures require `sessionOnly`: a browser session.
 * API-key callers get 403 on mutations (design D6).
 *
 * Procedures:
 *  - getProfile: current user's display name, username, email
 *  - updateProfile: change display name (sessionOnly)
 *  - getPreferences: read user's theme
 *  - updatePreferences: set theme (sessionOnly)
 *  - changePassword: verify current, set new, revoke OTHER sessions (sessionOnly)
 */

import * as z from "zod";
import { eq, and, ne, desc } from "drizzle-orm";
import { ORPCError } from "@orpc/server";

import { member, sessionOnly, ERROR_STATUS_MAP } from "../orpc";
import { auth } from "../auth";
import { db } from "../../db";
import {
  user as userTable,
  session as sessionTable,
  account as accountTable,
  userPreferences,
} from "../../db/schema";

// ---------------------------------------------------------------------------
// getProfile (member — read-only, API keys allowed)
// ---------------------------------------------------------------------------

export const getProfile = member
  .route({ method: "GET", path: "/account/profile" })
  .input(z.object({}))
  .handler(({ context }) => {
    const u = context.user as typeof context.user & {
      username?: string | null;
    };
    return {
      id: u.id,
      name: u.name,
      username: u.username ?? null,
      email: u.email,
    };
  });

// ---------------------------------------------------------------------------
// updateProfile (sessionOnly)
// ---------------------------------------------------------------------------

export const updateProfile = sessionOnly
  .route({ method: "POST", path: "/account/profile" })
  .input(
    z.object({
      name: z.string().min(1, "Display name is required").max(128),
    }),
  )
  .handler(({ context, input }) => {
    db.update(userTable)
      .set({ name: input.name, updatedAt: new Date() })
      .where(eq(userTable.id, context.user.id))
      .run();

    return { ok: true, name: input.name };
  });

// ---------------------------------------------------------------------------
// getPreferences (member — read-only, API keys allowed)
// ---------------------------------------------------------------------------

export const getPreferences = member
  .route({ method: "GET", path: "/account/preferences" })
  .input(z.object({}))
  .handler(({ context }) => {
    const row = db
      .select({
        theme: userPreferences.theme,
        propertyScope: userPreferences.propertyScope,
      })
      .from(userPreferences)
      .where(eq(userPreferences.userId, context.user.id))
      .get();

    return {
      theme: row?.theme ?? "system",
      propertyScope: row?.propertyScope ?? null,
    };
  });

// ---------------------------------------------------------------------------
// updatePreferences (sessionOnly)
// ---------------------------------------------------------------------------

/**
 * Update theme and/or the property scope (D7). The property scope is the
 * entity id of a property place, or null for "All".
 */
export const updatePreferences = sessionOnly
  .route({ method: "POST", path: "/account/preferences" })
  .input(
    z.object({
      theme: z.enum(["light", "dark", "system"]).optional(),
      propertyScope: z.string().nullable().optional(),
    }),
  )
  .handler(({ context, input }) => {
    const set: Record<string, unknown> = {};
    if (input.theme !== undefined) set.theme = input.theme;
    if (input.propertyScope !== undefined) set.propertyScope = input.propertyScope;

    db.insert(userPreferences)
      .values({
        userId: context.user.id,
        theme: (input.theme ?? "system") as "light" | "dark" | "system",
        propertyScope: input.propertyScope ?? null,
      })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set,
      })
      .run();

    return { ok: true, theme: input.theme, propertyScope: input.propertyScope };
  });

// ---------------------------------------------------------------------------
// changePassword (sessionOnly)
// ---------------------------------------------------------------------------

/**
 * Resolve the current session id. In production (Next.js request context),
 * reads the session token from the cookie and looks up the session row.
 * Falls back to the most recently updated session for the user (used by
 * tests where there is no cookie context).
 */
async function resolveCurrentSessionId(
  userId: string,
): Promise<string | null> {
  // Try to read the session token from the cookie (production path).
  try {
    const nextHeaders = await import("next/headers");
    const cookieStore = await nextHeaders.cookies();
    const token =
      cookieStore.get("better-auth.session_token")?.value ??
      cookieStore.get("__Secure-better-auth.session_token")?.value;
    if (token) {
      const sess = db
        .select({ id: sessionTable.id })
        .from(sessionTable)
        .where(eq(sessionTable.token, token))
        .get();
      if (sess) return sess.id;
    }
  } catch {
    // Not in a Next.js request context (e.g. tests) — fall through.
  }

  // Heuristic fallback: keep the most recently updated session.
  const latest = db
    .select({ id: sessionTable.id })
    .from(sessionTable)
    .where(eq(sessionTable.userId, userId))
    .orderBy(desc(sessionTable.updatedAt))
    .limit(1)
    .get();

  return latest?.id ?? null;
}

export const changePassword = sessionOnly
  .route({ method: "POST", path: "/account/password" })
  .input(
    z.object({
      currentPassword: z.string().min(1, "Current password is required"),
      newPassword: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .max(128),
    }),
  )
  .handler(async ({ context, input }) => {
    const userId = context.user.id;

    // 1. Load the credential account and verify the current password.
    const credAccount = db
      .select({ password: accountTable.password })
      .from(accountTable)
      .where(
        and(
          eq(accountTable.userId, userId),
          eq(accountTable.providerId, "credential"),
        ),
      )
      .get();

    if (!credAccount?.password) {
      throw new ORPCError("internal_error", {
        status: ERROR_STATUS_MAP.internal_error,
        message: "No credential account found.",
      });
    }

    const authCtx = await auth.$context;
    const valid = await authCtx.password.verify({
      hash: credAccount.password,
      password: input.currentPassword,
    });

    if (!valid) {
      throw new ORPCError("validation_error", {
        status: ERROR_STATUS_MAP.validation_error,
        message: "Current password is incorrect.",
      });
    }

    // 2. Hash the new password and update the credential account.
    const newHash = await authCtx.password.hash(input.newPassword);
    db.update(accountTable)
      .set({ password: newHash, updatedAt: new Date() })
      .where(
        and(
          eq(accountTable.userId, userId),
          eq(accountTable.providerId, "credential"),
        ),
      )
      .run();

    // 3. Revoke OTHER sessions — keep the current one.
    const currentSessionId = await resolveCurrentSessionId(userId);

    if (currentSessionId) {
      db.delete(sessionTable)
        .where(
          and(
            eq(sessionTable.userId, userId),
            ne(sessionTable.id, currentSessionId),
          ),
        )
        .run();
    }

    return { ok: true };
  });
