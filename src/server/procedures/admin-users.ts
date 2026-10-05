/**
 * Admin user management procedures (task 5.1).
 *
 * All procedures require `admin` + `sessionOnly` middleware: an admin session
 * via a browser cookie. API-key callers always get 403, even if the key
 * belongs to an admin (design D6, spec: "API keys cannot manage accounts").
 *
 * Uses Better Auth's internal adapter for user creation and password hashing,
 * and direct DB queries for banning, role changes, session revocation, and
 * listing — our middleware has already verified admin status.
 */

import * as z from "zod";
import { eq, and, or, isNull, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";

import { admin, ERROR_STATUS_MAP } from "../orpc";
import { auth } from "../auth";
import { db } from "../../db";
import { user as userTable, session as sessionTable, account as accountTable } from "../../db/schema";

// ---------------------------------------------------------------------------
// Shared base: admin + sessionOnly
// ---------------------------------------------------------------------------

/**
 * Middleware chain: admin (requires admin role, which implies member) then
 * sessionOnly (rejects API-key callers). This is the guard for all admin
 * user management procedures.
 */
const adminSession = admin.use(({ context, next }) => {
  if (typeof context.via !== "string") {
    throw new ORPCError("forbidden", {
      status: ERROR_STATUS_MAP.forbidden,
      message: "This action requires a browser session.",
    });
  }
  return next();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count active admins: role = 'admin' AND not banned. */
function countActiveAdmins(dbInstance: typeof db = db): number {
  const row = dbInstance
    .select({ count: sql<number>`count(*)` })
    .from(userTable)
    .where(
      and(
        eq(userTable.role, "admin"),
        or(eq(userTable.banned, false), isNull(userTable.banned)),
      ),
    )
    .get();
  return row?.count ?? 0;
}

/** Check if the target user is the last active admin; throw conflict if so. */
function guardLastAdmin(
  targetUserId: string,
  action: string,
  dbInstance: typeof db = db,
): void {
  const target = dbInstance
    .select({ role: userTable.role, banned: userTable.banned })
    .from(userTable)
    .where(eq(userTable.id, targetUserId))
    .get();

  if (!target) {
    throw new ORPCError("not_found", {
      status: ERROR_STATUS_MAP.not_found,
      message: "User not found.",
    });
  }

  // Only need to guard if the target is currently an active admin.
  const isBanned = target.banned === true;
  if (target.role !== "admin" || isBanned) return;

  const activeAdmins = countActiveAdmins(dbInstance);
  if (activeAdmins <= 1) {
    throw new ORPCError("conflict", {
      status: ERROR_STATUS_MAP.conflict,
      message: `Cannot ${action} the last active admin.`,
    });
  }
}

// ---------------------------------------------------------------------------
// listUsers
// ---------------------------------------------------------------------------

export const listUsers = adminSession
  .route({ method: "GET", path: "/admin/users" })
  .input(z.object({}))
  .handler(() => {
    const users = db
      .select({
        id: userTable.id,
        username: userTable.username,
        name: userTable.name,
        email: userTable.email,
        role: userTable.role,
        banned: userTable.banned,
        banReason: userTable.banReason,
        createdAt: userTable.createdAt,
      })
      .from(userTable)
      .orderBy(userTable.createdAt)
      .all();

    return { users };
  });

// ---------------------------------------------------------------------------
// createUser
// ---------------------------------------------------------------------------

export const createUser = adminSession
  .route({ method: "POST", path: "/admin/users" })
  .input(
    z.object({
      username: z.string().min(1, "Username is required").max(64),
      password: z.string().min(8, "Password must be at least 8 characters").max(128),
      name: z.string().min(1, "Name is required").max(128),
      role: z.enum(["admin", "user"]).default("user"),
    }),
  )
  .handler(async ({ input }) => {
    // Check for duplicate username.
    const existing = db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.username, input.username))
      .get();

    if (existing) {
      throw new ORPCError("conflict", {
        status: ERROR_STATUS_MAP.conflict,
        message: `Username "${input.username}" is already taken.`,
      });
    }

    const email = `${input.username}@users.hearth.invalid`;

    // Also check email uniqueness (synthetic but Better Auth enforces it).
    const existingEmail = db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, email))
      .get();

    if (existingEmail) {
      throw new ORPCError("conflict", {
        status: ERROR_STATUS_MAP.conflict,
        message: `Username "${input.username}" is already taken.`,
      });
    }

    // Use Better Auth's internal adapter (same approach as bootstrap).
    const ctx = await auth.$context;
    const hash = await ctx.password.hash(input.password);

    const created = await ctx.internalAdapter.createUser(
      {
        email,
        name: input.name,
        username: input.username,
        role: input.role,
        emailVerified: true,
      },
      { method: "admin" },
    );

    if (!created) {
      throw new ORPCError("internal_error", {
        status: ERROR_STATUS_MAP.internal_error,
        message: "Failed to create user.",
      });
    }

    // Attach credential account so the user can sign in with a password.
    await ctx.internalAdapter.linkAccount({
      userId: created.id,
      providerId: "credential",
      accountId: created.id,
      password: hash,
    });

    return {
      id: created.id,
      username: input.username,
      name: input.name,
      role: input.role,
    };
  });

// ---------------------------------------------------------------------------
// resetPassword
// ---------------------------------------------------------------------------

export const resetPassword = adminSession
  .route({ method: "POST", path: "/admin/users/{id}/password" })
  .input(
    z.object({
      id: z.string().min(1),
      newPassword: z.string().min(8, "Password must be at least 8 characters").max(128),
    }),
  )
  .handler(async ({ input }) => {
    const target = db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.id, input.id))
      .get();

    if (!target) {
      throw new ORPCError("not_found", {
        status: ERROR_STATUS_MAP.not_found,
        message: "User not found.",
      });
    }

    // Hash the new password using Better Auth's password hasher.
    const ctx = await auth.$context;
    const hash = await ctx.password.hash(input.newPassword);

    // Update the credential account's password.
    db.update(accountTable)
      .set({ password: hash, updatedAt: new Date() })
      .where(
        and(
          eq(accountTable.userId, input.id),
          eq(accountTable.providerId, "credential"),
        ),
      )
      .run();

    return { ok: true };
  });

// ---------------------------------------------------------------------------
// setUserRole
// ---------------------------------------------------------------------------

export const setUserRole = adminSession
  .route({ method: "POST", path: "/admin/users/{id}/role" })
  .input(
    z.object({
      id: z.string().min(1),
      role: z.enum(["admin", "user"]),
    }),
  )
  .handler(({ input }) => {
    // If demoting to user, guard last-admin.
    if (input.role === "user") {
      guardLastAdmin(input.id, "demote");
    }

    const target = db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.id, input.id))
      .get();

    if (!target) {
      throw new ORPCError("not_found", {
        status: ERROR_STATUS_MAP.not_found,
        message: "User not found.",
      });
    }

    db.update(userTable)
      .set({ role: input.role, updatedAt: new Date() })
      .where(eq(userTable.id, input.id))
      .run();

    return { ok: true };
  });

// ---------------------------------------------------------------------------
// disableUser
// ---------------------------------------------------------------------------

export const disableUser = adminSession
  .route({ method: "POST", path: "/admin/users/{id}/disable" })
  .input(
    z.object({
      id: z.string().min(1),
      reason: z.string().max(500).optional(),
    }),
  )
  .handler(({ input }) => {
    guardLastAdmin(input.id, "disable");

    const target = db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.id, input.id))
      .get();

    if (!target) {
      throw new ORPCError("not_found", {
        status: ERROR_STATUS_MAP.not_found,
        message: "User not found.",
      });
    }

    // Ban the user.
    db.update(userTable)
      .set({
        banned: true,
        banReason: input.reason ?? null,
        updatedAt: new Date(),
      })
      .where(eq(userTable.id, input.id))
      .run();

    // Revoke all sessions for this user (spec: "sessions stop working").
    db.delete(sessionTable)
      .where(eq(sessionTable.userId, input.id))
      .run();

    // API keys stop working because context.ts checks owner.banned and
    // returns user: null for banned owners (design D6).

    return { ok: true };
  });

// ---------------------------------------------------------------------------
// enableUser
// ---------------------------------------------------------------------------

export const enableUser = adminSession
  .route({ method: "POST", path: "/admin/users/{id}/enable" })
  .input(
    z.object({
      id: z.string().min(1),
    }),
  )
  .handler(({ input }) => {
    const target = db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.id, input.id))
      .get();

    if (!target) {
      throw new ORPCError("not_found", {
        status: ERROR_STATUS_MAP.not_found,
        message: "User not found.",
      });
    }

    db.update(userTable)
      .set({
        banned: false,
        banReason: null,
        updatedAt: new Date(),
      })
      .where(eq(userTable.id, input.id))
      .run();

    return { ok: true };
  });
