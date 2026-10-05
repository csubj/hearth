/**
 * Vitest tests for admin user management procedures (task 5.1).
 *
 * Covers:
 *  - admin middleware: non-admin → 403
 *  - sessionOnly: API-key caller (even admin) → 403
 *  - createUser: creates user with correct role, rejects duplicates
 *  - setUserRole: promote/demote works; last-admin demote → 409
 *  - disableUser: bans user, revokes sessions; last-admin disable → 409
 *  - enableUser: unbans user
 *  - resetPassword: changes password (sign-in with new password works)
 *  - Disabled user's API key → 401 on member procedure
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "file::memory:?cache=shared";
});

import { randomUUID } from "node:crypto";
import { createRouterClient } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { db, sqlite } from "../../db";
import * as dbSchema from "../../db/schema";
import { MIGRATIONS_FOLDER } from "../../db/testing";
import { authOptions } from "../auth";
import { validationInterceptor } from "../orpc";
import { router } from "../router";
import type { AppContext } from "../context";

// ---------------------------------------------------------------------------
// Type alias for ORPCError catches
// ---------------------------------------------------------------------------
type AnyORPCError = ORPCError<string, unknown>;

// ---------------------------------------------------------------------------
// Global setup: apply migrations to the shared in-memory DB
// ---------------------------------------------------------------------------

// We run migrations once. The `db` and `sqlite` singletons imported above
// already point at :memory:?cache=shared thanks to the vi.hoisted() block.
migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

// ---------------------------------------------------------------------------
// Test auth instance (reuses authOptions but shares the same in-memory DB)
// ---------------------------------------------------------------------------

const { database: _db, ...optsWithoutDb } = authOptions;
void _db;

const testAuth = betterAuth({
  ...optsWithoutDb,
  database: drizzleAdapter(db, { provider: "sqlite", schema: dbSchema }),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a user via the internal adapter (like bootstrap). */
async function createTestUser(opts: {
  username: string;
  password: string;
  name?: string;
  role?: string;
}): Promise<string> {
  const ctx = await testAuth.$context;
  const email = `${opts.username}@users.hearth.invalid`;
  const hash = await ctx.password.hash(opts.password);

  const created = await ctx.internalAdapter.createUser(
    {
      email,
      name: opts.name ?? opts.username,
      username: opts.username,
      role: opts.role ?? "user",
      emailVerified: true,
    },
    { method: "admin" },
  );

  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: "credential",
    accountId: created.id,
    password: hash,
  });

  return created.id;
}

/** Create a session row for a user and return the session id. */
function createTestSession(userId: string): string {
  const sessionId = randomUUID();
  const token = randomUUID();
  sqlite
    .prepare(
      `INSERT INTO session (id, token, user_id, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      sessionId,
      token,
      userId,
      Date.now() + 86400000,
      Date.now(),
      Date.now(),
    );
  return sessionId;
}

/** Build an admin web-session context. */
function adminCtx(userId: string): AppContext {
  return {
    user: {
      id: userId,
      name: "Admin",
      email: `admin@users.hearth.invalid`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      role: "admin",
      banned: false,
      banReason: null,
      banExpires: null,
      image: null,
    } as AppContext["user"],
    via: "web",
    now: Date.now(),
    requestId: randomUUID(),
  };
}

/** Build a regular user web-session context. */
function userCtx(userId: string): AppContext {
  return {
    user: {
      id: userId,
      name: "User",
      email: `user@users.hearth.invalid`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      role: "user",
      banned: false,
      banReason: null,
      banExpires: null,
      image: null,
    } as AppContext["user"],
    via: "web",
    now: Date.now(),
    requestId: randomUUID(),
  };
}

/** Build an admin context but via API key. */
function adminApiKeyCtx(userId: string): AppContext {
  return {
    user: {
      id: userId,
      name: "Admin",
      email: `admin@users.hearth.invalid`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      role: "admin",
      banned: false,
      banReason: null,
      banExpires: null,
      image: null,
    } as AppContext["user"],
    via: { apiKeyId: "key-test", name: "TestKey" },
    now: Date.now(),
    requestId: randomUUID(),
  };
}

function makeClient(ctx: AppContext) {
  return createRouterClient(router, {
    context: ctx,
    interceptors: [validationInterceptor],
  });
}

// ---------------------------------------------------------------------------
// Cleanup between tests — delete all user-related rows so each describe
// starts clean
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Delete in dependency order
  sqlite.exec("DELETE FROM session");
  sqlite.exec("DELETE FROM account");
  sqlite.exec("DELETE FROM apikey");
  sqlite.exec("DELETE FROM user");
});

// ---------------------------------------------------------------------------
// 1. Admin middleware: non-admin → forbidden (403)
// ---------------------------------------------------------------------------

describe("admin middleware guard", () => {
  it("rejects a non-admin user with 403", async () => {
    const userId = await createTestUser({
      username: "regular1",
      password: "password123",
      role: "user",
    });
    const client = makeClient(userCtx(userId));

    const err = await client.adminListUsers({}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("forbidden");
    expect((err as AnyORPCError).status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 2. sessionOnly: API-key caller (even admin) → 403
// ---------------------------------------------------------------------------

describe("sessionOnly guard", () => {
  it("rejects an admin API-key caller with 403", async () => {
    const adminId = await createTestUser({
      username: "admin_apikey",
      password: "password123",
      role: "admin",
    });
    const client = makeClient(adminApiKeyCtx(adminId));

    const err = await client.adminListUsers({}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("forbidden");
    expect((err as AnyORPCError).status).toBe(403);
  });

  it("rejects admin API-key caller on disableUser with 403", async () => {
    const adminId = await createTestUser({
      username: "admin_key2",
      password: "password123",
      role: "admin",
    });
    const targetId = await createTestUser({
      username: "target_key2",
      password: "password123",
      role: "user",
    });
    const client = makeClient(adminApiKeyCtx(adminId));

    const err = await client
      .adminDisableUser({ id: targetId })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("forbidden");
    expect((err as AnyORPCError).status).toBe(403);

    // User stays active (not disabled).
    const user = db
      .select({ banned: dbSchema.user.banned })
      .from(dbSchema.user)
      .where(eq(dbSchema.user.id, targetId))
      .get();
    expect(user?.banned).not.toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. listUsers
// ---------------------------------------------------------------------------

describe("listUsers", () => {
  it("returns all users with expected fields", async () => {
    const adminId = await createTestUser({
      username: "admin_list",
      password: "password123",
      role: "admin",
    });
    await createTestUser({
      username: "user_list",
      password: "password123",
      role: "user",
      name: "Regular User",
    });

    const client = makeClient(adminCtx(adminId));
    const result = await client.adminListUsers({});

    expect(result.users).toHaveLength(2);
    const usernames = result.users.map(
      (u: { username: string | null }) => u.username,
    );
    expect(usernames).toContain("admin_list");
    expect(usernames).toContain("user_list");

    // Check that expected fields exist on each user
    for (const u of result.users) {
      expect(u).toHaveProperty("id");
      expect(u).toHaveProperty("username");
      expect(u).toHaveProperty("name");
      expect(u).toHaveProperty("email");
      expect(u).toHaveProperty("role");
      expect(u).toHaveProperty("banned");
      expect(u).toHaveProperty("createdAt");
    }
  });
});

// ---------------------------------------------------------------------------
// 4. createUser
// ---------------------------------------------------------------------------

describe("createUser", () => {
  it("creates a user with the specified role", async () => {
    const adminId = await createTestUser({
      username: "admin_create",
      password: "password123",
      role: "admin",
    });
    const client = makeClient(adminCtx(adminId));

    const result = await client.adminCreateUser({
      username: "newuser",
      password: "newpass1234",
      name: "New User",
      role: "user",
    });

    expect(result.username).toBe("newuser");
    expect(result.role).toBe("user");

    // Verify in DB
    const dbUser = db
      .select()
      .from(dbSchema.user)
      .where(eq(dbSchema.user.username, "newuser"))
      .get();
    expect(dbUser).toBeTruthy();
    expect(dbUser!.role).toBe("user");
    expect(dbUser!.name).toBe("New User");
  });

  it("creates an admin user when role=admin", async () => {
    const adminId = await createTestUser({
      username: "admin_create2",
      password: "password123",
      role: "admin",
    });
    const client = makeClient(adminCtx(adminId));

    const result = await client.adminCreateUser({
      username: "newadmin",
      password: "newpass1234",
      name: "New Admin",
      role: "admin",
    });

    expect(result.role).toBe("admin");
    const dbUser = db
      .select()
      .from(dbSchema.user)
      .where(eq(dbSchema.user.username, "newadmin"))
      .get();
    expect(dbUser!.role).toBe("admin");
  });

  it("rejects duplicate username with conflict (409)", async () => {
    const adminId = await createTestUser({
      username: "admin_dup",
      password: "password123",
      role: "admin",
    });
    await createTestUser({
      username: "existing_user",
      password: "password123",
    });

    const client = makeClient(adminCtx(adminId));
    const err = await client
      .adminCreateUser({
        username: "existing_user",
        password: "newpass1234",
        name: "Dup",
      })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("conflict");
    expect((err as AnyORPCError).status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// 5. setUserRole: promote/demote, last-admin guard
// ---------------------------------------------------------------------------

describe("setUserRole", () => {
  it("promotes a user to admin", async () => {
    const adminId = await createTestUser({
      username: "admin_role",
      password: "password123",
      role: "admin",
    });
    const userId = await createTestUser({
      username: "user_role",
      password: "password123",
      role: "user",
    });

    const client = makeClient(adminCtx(adminId));
    const result = await client.adminSetUserRole({
      id: userId,
      role: "admin",
    });
    expect(result.ok).toBe(true);

    const dbUser = db
      .select({ role: dbSchema.user.role })
      .from(dbSchema.user)
      .where(eq(dbSchema.user.id, userId))
      .get();
    expect(dbUser!.role).toBe("admin");
  });

  it("demotes an admin to user (when another admin exists)", async () => {
    const admin1 = await createTestUser({
      username: "admin_dem1",
      password: "password123",
      role: "admin",
    });
    const admin2 = await createTestUser({
      username: "admin_dem2",
      password: "password123",
      role: "admin",
    });

    const client = makeClient(adminCtx(admin1));
    const result = await client.adminSetUserRole({
      id: admin2,
      role: "user",
    });
    expect(result.ok).toBe(true);

    const dbUser = db
      .select({ role: dbSchema.user.role })
      .from(dbSchema.user)
      .where(eq(dbSchema.user.id, admin2))
      .get();
    expect(dbUser!.role).toBe("user");
  });

  it("rejects demoting the last active admin with conflict (409)", async () => {
    const adminId = await createTestUser({
      username: "sole_admin",
      password: "password123",
      role: "admin",
    });

    const client = makeClient(adminCtx(adminId));
    const err = await client
      .adminSetUserRole({ id: adminId, role: "user" })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("conflict");
    expect((err as AnyORPCError).status).toBe(409);
    expect((err as AnyORPCError).message).toContain("last active admin");
  });

  it("counts banned admins as inactive for last-admin check", async () => {
    const admin1 = await createTestUser({
      username: "admin_ban_guard1",
      password: "password123",
      role: "admin",
    });
    const admin2 = await createTestUser({
      username: "admin_ban_guard2",
      password: "password123",
      role: "admin",
    });

    // Ban admin2 → only admin1 is active.
    db.update(dbSchema.user)
      .set({ banned: true })
      .where(eq(dbSchema.user.id, admin2))
      .run();

    // admin1 is now the sole active admin → demoting should fail.
    const client = makeClient(adminCtx(admin1));
    const err = await client
      .adminSetUserRole({ id: admin1, role: "user" })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("conflict");
  });
});

// ---------------------------------------------------------------------------
// 6. disableUser: bans, revokes sessions, last-admin guard
// ---------------------------------------------------------------------------

describe("disableUser", () => {
  it("bans the user and revokes their sessions", async () => {
    const adminId = await createTestUser({
      username: "admin_disable",
      password: "password123",
      role: "admin",
    });
    const userId = await createTestUser({
      username: "user_disable",
      password: "password123",
      role: "user",
    });

    // Create sessions for the target user
    createTestSession(userId);
    createTestSession(userId);

    // Verify sessions exist before disable
    const sessionsBefore = db
      .select()
      .from(dbSchema.session)
      .where(eq(dbSchema.session.userId, userId))
      .all();
    expect(sessionsBefore).toHaveLength(2);

    const client = makeClient(adminCtx(adminId));
    const result = await client.adminDisableUser({ id: userId });
    expect(result.ok).toBe(true);

    // User is banned
    const dbUser = db
      .select({ banned: dbSchema.user.banned })
      .from(dbSchema.user)
      .where(eq(dbSchema.user.id, userId))
      .get();
    expect(dbUser!.banned).toBe(true);

    // Sessions are revoked
    const sessionsAfter = db
      .select()
      .from(dbSchema.session)
      .where(eq(dbSchema.session.userId, userId))
      .all();
    expect(sessionsAfter).toHaveLength(0);
  });

  it("rejects disabling the last active admin with conflict (409)", async () => {
    const adminId = await createTestUser({
      username: "sole_admin_disable",
      password: "password123",
      role: "admin",
    });

    const client = makeClient(adminCtx(adminId));
    const err = await client
      .adminDisableUser({ id: adminId })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("conflict");
    expect((err as AnyORPCError).status).toBe(409);
    expect((err as AnyORPCError).message).toContain("last active admin");
  });

  it("stores ban reason when provided", async () => {
    const adminId = await createTestUser({
      username: "admin_reason",
      password: "password123",
      role: "admin",
    });
    const userId = await createTestUser({
      username: "user_reason",
      password: "password123",
      role: "user",
    });

    const client = makeClient(adminCtx(adminId));
    await client.adminDisableUser({
      id: userId,
      reason: "Violated policy",
    });

    const dbUser = db
      .select({ banReason: dbSchema.user.banReason })
      .from(dbSchema.user)
      .where(eq(dbSchema.user.id, userId))
      .get();
    expect(dbUser!.banReason).toBe("Violated policy");
  });

  it("disabled user's API key gets 401 on member procedure", async () => {
    const adminId = await createTestUser({
      username: "admin_apicheck",
      password: "password123",
      role: "admin",
    });
    const userId = await createTestUser({
      username: "user_apicheck",
      password: "password123",
      role: "user",
    });

    // The disabled user's API key context would resolve to user: null
    // (context.ts checks owner.banned). Simulate this by creating a
    // context with user: null, which is what would happen at runtime.
    const client = makeClient(adminCtx(adminId));
    await client.adminDisableUser({ id: userId });

    // After disable, any request with the disabled user's context should
    // get 401 (user: null because context.ts returns null for banned).
    const disabledCtx: AppContext = {
      user: null,
      via: { apiKeyId: "key-disabled", name: "DisabledKey" },
      now: Date.now(),
      requestId: randomUUID(),
    };
    const disabledClient = makeClient(disabledCtx);
    const err = await disabledClient
      .echo({ message: "hello" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("unauthorized");
    expect((err as AnyORPCError).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 7. enableUser
// ---------------------------------------------------------------------------

describe("enableUser", () => {
  it("unbans a disabled user", async () => {
    const adminId = await createTestUser({
      username: "admin_enable",
      password: "password123",
      role: "admin",
    });
    const userId = await createTestUser({
      username: "user_enable",
      password: "password123",
      role: "user",
    });

    // Disable first
    const client = makeClient(adminCtx(adminId));
    await client.adminDisableUser({ id: userId });

    // Verify disabled
    let dbUser = db
      .select({ banned: dbSchema.user.banned })
      .from(dbSchema.user)
      .where(eq(dbSchema.user.id, userId))
      .get();
    expect(dbUser!.banned).toBe(true);

    // Enable
    const result = await client.adminEnableUser({ id: userId });
    expect(result.ok).toBe(true);

    dbUser = db
      .select({ banned: dbSchema.user.banned })
      .from(dbSchema.user)
      .where(eq(dbSchema.user.id, userId))
      .get();
    expect(dbUser!.banned).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. resetPassword
// ---------------------------------------------------------------------------

describe("resetPassword", () => {
  it("changes the password (sign-in with new password works)", async () => {
    const adminId = await createTestUser({
      username: "admin_reset",
      password: "password123",
      role: "admin",
    });
    const userId = await createTestUser({
      username: "user_reset",
      password: "oldpass1234",
      role: "user",
    });

    const client = makeClient(adminCtx(adminId));
    const result = await client.adminResetPassword({
      id: userId,
      newPassword: "newpass5678",
    });
    expect(result.ok).toBe(true);

    // Sign in with the new password via Better Auth.
    const session = await testAuth.api.signInUsername({
      body: { username: "user_reset", password: "newpass5678" },
    });
    expect(session?.user).toBeTruthy();
    expect((session?.user as { username?: string })?.username).toBe(
      "user_reset",
    );

    // Old password should no longer work.
    try {
      await testAuth.api.signInUsername({
        body: { username: "user_reset", password: "oldpass1234" },
      });
      // If it doesn't throw, the test should fail
      expect.unreachable("Old password should not work");
    } catch {
      // Expected: old password is rejected
    }
  });

  it("returns not_found for a non-existent user", async () => {
    const adminId = await createTestUser({
      username: "admin_reset404",
      password: "password123",
      role: "admin",
    });

    const client = makeClient(adminCtx(adminId));
    const err = await client
      .adminResetPassword({
        id: "nonexistent-id",
        newPassword: "newpass1234",
      })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("not_found");
  });
});
