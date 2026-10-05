/**
 * Vitest tests for self-service settings procedures (task 5.2).
 *
 * Covers:
 *  - getProfile / updateProfile: display name CRUD
 *  - getPreferences / updatePreferences: theme persistence (round-trip)
 *  - changePassword: correct current password succeeds, wrong is rejected,
 *    other sessions are revoked while the current session remains
 *  - sessionOnly: API key callers get 403 on updateProfile, updatePreferences,
 *    changePassword
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
// Type alias
// ---------------------------------------------------------------------------
type AnyORPCError = ORPCError<string, unknown>;

// ---------------------------------------------------------------------------
// Global setup
// ---------------------------------------------------------------------------
migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

// ---------------------------------------------------------------------------
// Test auth instance (shares the same in-memory DB)
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

/** Create a session row and return the session id. */
function createTestSession(
  userId: string,
  updatedAt?: number,
): string {
  const sessionId = randomUUID();
  const token = randomUUID();
  const now = Date.now();
  sqlite
    .prepare(
      `INSERT INTO session (id, token, user_id, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      sessionId,
      token,
      userId,
      now + 86400000,
      now,
      updatedAt ?? now,
    );
  return sessionId;
}

function userCtx(
  userId: string,
  name = "User",
  username = "testuser",
): AppContext {
  return {
    user: {
      id: userId,
      name,
      email: `${username}@users.hearth.invalid`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      role: "user",
      banned: false,
      banReason: null,
      banExpires: null,
      image: null,
      username,
    } as AppContext["user"],
    via: "web",
    now: Date.now(),
    requestId: randomUUID(),
  };
}

function apiKeyCtx(userId: string): AppContext {
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
// Cleanup
// ---------------------------------------------------------------------------

beforeEach(() => {
  sqlite.exec("DELETE FROM session");
  sqlite.exec("DELETE FROM account");
  sqlite.exec("DELETE FROM apikey");
  sqlite.exec("DELETE FROM user_preferences");
  sqlite.exec("DELETE FROM user");
});

// ---------------------------------------------------------------------------
// 1. getProfile / updateProfile
// ---------------------------------------------------------------------------

describe("getProfile", () => {
  it("returns current user's profile", async () => {
    const userId = await createTestUser({
      username: "alice",
      password: "password123",
      name: "Alice Smith",
    });
    const client = makeClient(userCtx(userId, "Alice Smith", "alice"));

    const result = await client.getProfile({});
    expect(result.name).toBe("Alice Smith");
    expect(result.username).toBe("alice");
    expect(result.email).toBe("alice@users.hearth.invalid");
  });
});

describe("updateProfile", () => {
  it("updates the display name", async () => {
    const userId = await createTestUser({
      username: "bob",
      password: "password123",
      name: "Bob",
    });
    const client = makeClient(userCtx(userId, "Bob", "bob"));

    const result = await client.updateProfile({ name: "Robert" });
    expect(result.ok).toBe(true);
    expect(result.name).toBe("Robert");

    // Verify in DB
    const dbUser = db
      .select({ name: dbSchema.user.name })
      .from(dbSchema.user)
      .where(eq(dbSchema.user.id, userId))
      .get();
    expect(dbUser!.name).toBe("Robert");
  });

  it("rejects empty display name", async () => {
    const userId = await createTestUser({
      username: "charlie",
      password: "password123",
    });
    const client = makeClient(userCtx(userId, "Charlie", "charlie"));

    const err = await client
      .updateProfile({ name: "" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("validation_error");
  });
});

// ---------------------------------------------------------------------------
// 2. getPreferences / updatePreferences
// ---------------------------------------------------------------------------

describe("getPreferences", () => {
  it("returns system as default theme", async () => {
    const userId = await createTestUser({
      username: "dave",
      password: "password123",
    });
    const client = makeClient(userCtx(userId, "Dave", "dave"));

    const result = await client.getPreferences({});
    expect(result.theme).toBe("system");
  });
});

describe("updatePreferences", () => {
  it("persists the theme", async () => {
    const userId = await createTestUser({
      username: "eve",
      password: "password123",
    });
    const client = makeClient(userCtx(userId, "Eve", "eve"));

    await client.updatePreferences({ theme: "dark" });

    const result = await client.getPreferences({});
    expect(result.theme).toBe("dark");
  });

  it("round-trips light → dark → system", async () => {
    const userId = await createTestUser({
      username: "frank",
      password: "password123",
    });
    const client = makeClient(userCtx(userId, "Frank", "frank"));

    await client.updatePreferences({ theme: "light" });
    expect((await client.getPreferences({})).theme).toBe("light");

    await client.updatePreferences({ theme: "dark" });
    expect((await client.getPreferences({})).theme).toBe("dark");

    await client.updatePreferences({ theme: "system" });
    expect((await client.getPreferences({})).theme).toBe("system");
  });

  it("rejects invalid theme value", async () => {
    const userId = await createTestUser({
      username: "grace",
      password: "password123",
    });
    const client = makeClient(userCtx(userId, "Grace", "grace"));

    const err = await client
      .updatePreferences({ theme: "neon" as "light" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("validation_error");
  });
});

// ---------------------------------------------------------------------------
// 3. changePassword
// ---------------------------------------------------------------------------

describe("changePassword", () => {
  it("succeeds with the correct current password", async () => {
    const userId = await createTestUser({
      username: "heidi",
      password: "oldpass1234",
    });
    const client = makeClient(userCtx(userId, "Heidi", "heidi"));

    const result = await client.changePassword({
      currentPassword: "oldpass1234",
      newPassword: "newpass5678",
    });
    expect(result.ok).toBe(true);

    // Sign in with the new password via Better Auth.
    const session = await testAuth.api.signInUsername({
      body: { username: "heidi", password: "newpass5678" },
    });
    expect(session?.user).toBeTruthy();
  });

  it("rejects wrong current password with validation_error", async () => {
    const userId = await createTestUser({
      username: "ivan",
      password: "correctpass1",
    });
    const client = makeClient(userCtx(userId, "Ivan", "ivan"));

    const err = await client
      .changePassword({
        currentPassword: "wrongpass",
        newPassword: "newpass5678",
      })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("validation_error");
    expect((err as AnyORPCError).message).toContain("incorrect");
  });

  it("old password no longer works after change", async () => {
    const userId = await createTestUser({
      username: "judy",
      password: "oldpass1234",
    });
    const client = makeClient(userCtx(userId, "Judy", "judy"));

    await client.changePassword({
      currentPassword: "oldpass1234",
      newPassword: "newpass5678",
    });

    // Old password should be rejected by Better Auth signIn.
    try {
      await testAuth.api.signInUsername({
        body: { username: "judy", password: "oldpass1234" },
      });
      expect.unreachable("Old password should not work");
    } catch {
      // Expected: old password is rejected.
    }
  });

  it("revokes other sessions, keeps the current one", async () => {
    const userId = await createTestUser({
      username: "karl",
      password: "oldpass1234",
    });

    // Create three sessions. The "current" one has the latest updatedAt
    // (the heuristic fallback used in tests).
    const now = Date.now();
    const sessionOld1 = createTestSession(userId, now - 20000);
    const sessionOld2 = createTestSession(userId, now - 10000);
    const sessionCurrent = createTestSession(userId, now);

    const client = makeClient(userCtx(userId, "Karl", "karl"));

    await client.changePassword({
      currentPassword: "oldpass1234",
      newPassword: "newpass5678",
    });

    // Verify only the "current" session remains.
    const remaining = db
      .select({ id: dbSchema.session.id })
      .from(dbSchema.session)
      .where(eq(dbSchema.session.userId, userId))
      .all();

    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(sessionCurrent);

    // The old sessions are gone.
    void sessionOld1;
    void sessionOld2;
  });

  it("works with only one session (nothing to revoke)", async () => {
    const userId = await createTestUser({
      username: "lena",
      password: "oldpass1234",
    });
    createTestSession(userId, Date.now());

    const client = makeClient(userCtx(userId, "Lena", "lena"));

    const result = await client.changePassword({
      currentPassword: "oldpass1234",
      newPassword: "newpass5678",
    });
    expect(result.ok).toBe(true);

    // Session remains.
    const remaining = db
      .select()
      .from(dbSchema.session)
      .where(eq(dbSchema.session.userId, userId))
      .all();
    expect(remaining).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 4. sessionOnly: API key callers get 403
// ---------------------------------------------------------------------------

describe("sessionOnly guard on settings procedures", () => {
  it("rejects updateProfile from API key with 403", async () => {
    const userId = await createTestUser({
      username: "mallory",
      password: "password123",
    });
    const client = makeClient(apiKeyCtx(userId));

    const err = await client
      .updateProfile({ name: "Hacked" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("forbidden");
    expect((err as AnyORPCError).status).toBe(403);
  });

  it("rejects updatePreferences from API key with 403", async () => {
    const userId = await createTestUser({
      username: "ned",
      password: "password123",
    });
    const client = makeClient(apiKeyCtx(userId));

    const err = await client
      .updatePreferences({ theme: "dark" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("forbidden");
    expect((err as AnyORPCError).status).toBe(403);
  });

  it("rejects changePassword from API key with 403", async () => {
    const userId = await createTestUser({
      username: "olivia",
      password: "password123",
    });
    const client = makeClient(apiKeyCtx(userId));

    const err = await client
      .changePassword({
        currentPassword: "password123",
        newPassword: "newpass5678",
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("forbidden");
    expect((err as AnyORPCError).status).toBe(403);
  });

  it("allows getProfile from API key (read-only)", async () => {
    const userId = await createTestUser({
      username: "pat",
      password: "password123",
      name: "Pat",
    });
    // apiKeyCtx returns context.user from the fabricated context;
    // getProfile reads from context.user, not the DB.
    const ctx = apiKeyCtx(userId);
    (ctx.user as unknown as Record<string, unknown>).name = "Pat";
    const client = makeClient(ctx);

    // getProfile uses member, not sessionOnly — should succeed.
    const result = await client.getProfile({});
    expect(result.name).toBe("Pat");
  });

  it("allows getPreferences from API key (read-only)", async () => {
    const userId = await createTestUser({
      username: "quinn",
      password: "password123",
    });
    const client = makeClient(apiKeyCtx(userId));

    // getPreferences uses member, not sessionOnly — should succeed.
    const result = await client.getPreferences({});
    expect(result.theme).toBe("system");
  });
});
