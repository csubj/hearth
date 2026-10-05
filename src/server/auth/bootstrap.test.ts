/**
 * Vitest tests for bootstrapAdmin (task 2.2).
 *
 * Each test gets its own in-memory Better Auth instance backed by a fresh
 * createTestDatabase() so tests are fully hermetic and never touch the
 * on-disk data/hearth.db.
 */

// Point the shared `src/db` singleton at an in-memory database *before* the
// modules below are imported, matching the pattern in auth.test.ts.
import { vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "file::memory:?cache=shared";
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { count } from "drizzle-orm";
import { createTestDatabase } from "../../db/testing";
import * as dbSchema from "../../db/schema";
import { authOptions } from "./index";
import {
  bootstrapAdmin,
  BootstrapError,
  type BootstrapAuthInstance,
} from "./bootstrap";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a fresh Better Auth instance backed by a fresh in-memory test DB.
 * Strips the production Drizzle adapter and substitutes the test one.
 */
function makeTestDeps() {
  const testDb = createTestDatabase();

  // Strip the production database adapter; re-add one pointing at the test DB.
  const { database: _db, ...optsWithoutDb } = authOptions;
  void _db;

  const testAuth = betterAuth({
    ...optsWithoutDb,
    database: drizzleAdapter(testDb.client, {
      provider: "sqlite",
      schema: dbSchema,
    }),
  });

  return {
    auth: testAuth as unknown as BootstrapAuthInstance,
    db: testDb.client,
    connection: testDb.connection,
  };
}

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

let savedUsername: string | undefined;
let savedPassword: string | undefined;

beforeEach(() => {
  savedUsername = process.env.ADMIN_USERNAME;
  savedPassword = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD = "s3cr3tPass!";
});

afterEach(() => {
  if (savedUsername === undefined) {
    delete process.env.ADMIN_USERNAME;
  } else {
    process.env.ADMIN_USERNAME = savedUsername;
  }
  if (savedPassword === undefined) {
    delete process.env.ADMIN_PASSWORD;
  } else {
    process.env.ADMIN_PASSWORD = savedPassword;
  }
});

// ---------------------------------------------------------------------------
// Case A: no users → creates admin; second call refuses
// ---------------------------------------------------------------------------

describe("Case A — empty instance", () => {
  it("creates exactly one admin user", async () => {
    const deps = makeTestDeps();

    const result = await bootstrapAdmin(deps);

    expect(result.username).toBe("admin");
    expect(result.email).toBe("admin@users.hearth.invalid");
    expect(result.id).toBeTruthy();

    const [{ value: userCount }] = await deps.db
      .select({ value: count() })
      .from(dbSchema.user);
    expect(userCount).toBe(1);
  });

  it("created user has role 'admin'", async () => {
    const deps = makeTestDeps();
    await bootstrapAdmin(deps);

    const users = await deps.db.select().from(dbSchema.user);
    expect(users).toHaveLength(1);
    expect(users[0].role).toBe("admin");
    expect(users[0].username).toBe("admin");
    expect(users[0].emailVerified).toBe(true);
  });

  it("password is stored hashed (not plaintext)", async () => {
    const deps = makeTestDeps();
    await bootstrapAdmin(deps);

    const accounts = await deps.db.select().from(dbSchema.account);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].providerId).toBe("credential");
    // The hashed password must be set and must not equal the raw secret.
    expect(accounts[0].password).toBeTruthy();
    expect(accounts[0].password).not.toBe("s3cr3tPass!");
  });

  it("second call throws BootstrapError and adds no new user", async () => {
    const deps = makeTestDeps();
    await bootstrapAdmin(deps);

    await expect(bootstrapAdmin(deps)).rejects.toBeInstanceOf(BootstrapError);
    await expect(bootstrapAdmin(deps)).rejects.toThrow(/Bootstrap refused/);

    // Still exactly one user after the refused call.
    const [{ value: userCount }] = await deps.db
      .select({ value: count() })
      .from(dbSchema.user);
    expect(userCount).toBe(1);
  });

  it("sign-in with bootstrap password works via auth.api.signInUsername", async () => {
    const testDb = createTestDatabase();
    const { database: _db2, ...optsWithoutDb } = authOptions;
    void _db2;
    const testAuth = betterAuth({
      ...optsWithoutDb,
      database: drizzleAdapter(testDb.client, {
        provider: "sqlite",
        schema: dbSchema,
      }),
    });

    await bootstrapAdmin({
      auth: testAuth as unknown as BootstrapAuthInstance,
      db: testDb.client,
    });

    const session = await testAuth.api.signInUsername({
      body: { username: "admin", password: "s3cr3tPass!" },
    });
    expect(session?.user?.username).toBe("admin");
    expect(session?.token).toBeTruthy();

    // Verify admin role from the DB (Better Auth's generic User type does not
    // expose plugin-added fields like `role` in the TypeScript return type).
    const users = await testDb.client.select().from(dbSchema.user);
    expect(users[0].role).toBe("admin");
  });
});

// ---------------------------------------------------------------------------
// Case B: users already exist → refuses without touching anything
// ---------------------------------------------------------------------------

describe("Case B — instance already has users", () => {
  it("throws BootstrapError when a user row exists", async () => {
    const deps = makeTestDeps();

    // Seed one user directly — no account row required for this test.
    await deps.db.insert(dbSchema.user).values({
      id: crypto.randomUUID(),
      name: "Existing User",
      email: "existing@users.hearth.invalid",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(bootstrapAdmin(deps)).rejects.toBeInstanceOf(BootstrapError);
    await expect(bootstrapAdmin(deps)).rejects.toThrow(/Bootstrap refused/);
  });

  it("does not create a new user when refusing", async () => {
    const deps = makeTestDeps();

    await deps.db.insert(dbSchema.user).values({
      id: crypto.randomUUID(),
      name: "Existing User",
      email: "existing@users.hearth.invalid",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Suppress the expected rejection.
    await bootstrapAdmin(deps).catch(() => {});

    const [{ value: userCount }] = await deps.db
      .select({ value: count() })
      .from(dbSchema.user);
    expect(userCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

describe("environment validation", () => {
  it("throws when ADMIN_PASSWORD is missing", async () => {
    const deps = makeTestDeps();
    delete process.env.ADMIN_PASSWORD;

    await expect(bootstrapAdmin(deps)).rejects.toBeInstanceOf(BootstrapError);
    await expect(bootstrapAdmin(deps)).rejects.toThrow(/ADMIN_PASSWORD/);
  });

  it("throws when ADMIN_PASSWORD is shorter than 8 characters", async () => {
    const deps = makeTestDeps();
    process.env.ADMIN_PASSWORD = "short";

    await expect(bootstrapAdmin(deps)).rejects.toBeInstanceOf(BootstrapError);
    await expect(bootstrapAdmin(deps)).rejects.toThrow(/8 characters/);
  });

  it("uses ADMIN_USERNAME env var when set", async () => {
    const deps = makeTestDeps();
    process.env.ADMIN_USERNAME = "hearthowner";

    const result = await bootstrapAdmin(deps);
    expect(result.username).toBe("hearthowner");
    expect(result.email).toBe("hearthowner@users.hearth.invalid");
  });

  it("defaults username to 'admin' when ADMIN_USERNAME is unset", async () => {
    const deps = makeTestDeps();
    delete process.env.ADMIN_USERNAME;

    const result = await bootstrapAdmin(deps);
    expect(result.username).toBe("admin");
  });
});
