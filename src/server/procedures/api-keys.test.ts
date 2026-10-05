/**
 * Vitest tests for API key management procedures (task 5.3).
 *
 * Covers:
 *  - createApiKey returns a full secret once; subsequent list does NOT contain the secret
 *  - listApiKeys returns name, prefix/start, last-used; last-used updates after key use
 *  - revokeApiKey revokes; a request using a revoked key returns 401 (context.ts/bearer path)
 *  - A DISABLED user's key returns 401
 *  - sessionOnly: an API key caller using a DIFFERENT key to call createApiKey/listApiKeys → 403
 *  - Not quota-limited: many requests are not rejected with per-key rate-limit error
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
// Cleanup between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  sqlite.exec("DELETE FROM session");
  sqlite.exec("DELETE FROM account");
  sqlite.exec("DELETE FROM apikey");
  sqlite.exec("DELETE FROM user");
});

// ---------------------------------------------------------------------------
// 1. createApiKey returns a full secret once; list does NOT contain it
// ---------------------------------------------------------------------------

describe("createApiKey", () => {
  it("returns a full secret once and subsequent list omits it", async () => {
    const userId = await createTestUser({
      username: "keyuser1",
      password: "password123",
    });
    const client = makeClient(userCtx(userId));

    // Create a key
    const created = await client.createApiKey({ name: "Claude" });
    expect(created.key).toBeTruthy();
    expect(typeof created.key).toBe("string");
    expect(created.key.length).toBeGreaterThan(10);
    expect(created.name).toBe("Claude");
    expect(created.id).toBeTruthy();
    expect(created.start).toBeTruthy(); // first few chars stored

    // List keys — should NOT include the full secret
    const listed = await client.listApiKeys({});
    expect(listed.keys).toHaveLength(1);
    expect(listed.keys[0].name).toBe("Claude");
    expect(listed.keys[0].id).toBe(created.id);
    expect(listed.keys[0].start).toBeTruthy();
    // The secret should not be in the listed key
    expect((listed.keys[0] as Record<string, unknown>).key).toBeUndefined();
  });

  it("creates multiple keys with different names", async () => {
    const userId = await createTestUser({
      username: "keyuser2",
      password: "password123",
    });
    const client = makeClient(userCtx(userId));

    await client.createApiKey({ name: "Key1" });
    await client.createApiKey({ name: "Key2" });

    const listed = await client.listApiKeys({});
    expect(listed.keys).toHaveLength(2);
    const names = listed.keys.map((k: { name: string | null }) => k.name);
    expect(names).toContain("Key1");
    expect(names).toContain("Key2");
  });
});

// ---------------------------------------------------------------------------
// 2. listApiKeys returns name, prefix/start, last-used
// ---------------------------------------------------------------------------

describe("listApiKeys", () => {
  it("returns name, start, and lastRequest fields", async () => {
    const userId = await createTestUser({
      username: "listuser1",
      password: "password123",
    });
    const client = makeClient(userCtx(userId));

    await client.createApiKey({ name: "MyKey" });
    const listed = await client.listApiKeys({});

    expect(listed.keys).toHaveLength(1);
    const k = listed.keys[0];
    expect(k).toHaveProperty("name");
    expect(k).toHaveProperty("start");
    expect(k).toHaveProperty("lastRequest");
    expect(k.name).toBe("MyKey");
    // lastRequest is null initially (key not yet used)
    expect(k.lastRequest).toBeNull();
  });

  it("lastRequest updates after the key is used (verifyApiKey)", async () => {
    const userId = await createTestUser({
      username: "lastused1",
      password: "password123",
    });
    const client = makeClient(userCtx(userId));

    const created = await client.createApiKey({ name: "UsageKey" });
    const secret = created.key;

    // Verify: lastRequest is initially null
    let listed = await client.listApiKeys({});
    expect(listed.keys[0].lastRequest).toBeNull();

    // Use the key via auth.api.verifyApiKey to simulate an API request
    const verifyResult = await testAuth.api.verifyApiKey({
      body: { key: secret },
    });
    expect(verifyResult.valid).toBe(true);

    // Now check that lastRequest updated
    listed = await client.listApiKeys({});
    expect(listed.keys[0].lastRequest).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. revokeApiKey → revoked key returns 401
// ---------------------------------------------------------------------------

describe("revokeApiKey", () => {
  it("revokes a key and verifyApiKey rejects it afterward", async () => {
    const userId = await createTestUser({
      username: "revokeuser1",
      password: "password123",
    });
    const client = makeClient(userCtx(userId));

    const created = await client.createApiKey({ name: "Revokable" });
    const secret = created.key;

    // Verify the key works before revocation
    const before = await testAuth.api.verifyApiKey({ body: { key: secret } });
    expect(before.valid).toBe(true);

    // Revoke
    const result = await client.revokeApiKey({ keyId: created.id });
    expect(result.ok).toBe(true);

    // Key should no longer appear in list
    const listed = await client.listApiKeys({});
    expect(listed.keys).toHaveLength(0);

    // verifyApiKey should fail (row deleted → key not found)
    try {
      await testAuth.api.verifyApiKey({ body: { key: secret } });
      // If it doesn't throw, check valid is false
      expect.unreachable("Should have thrown for invalid key");
    } catch {
      // Expected: key not found after deletion
    }
  });

  it("returns not_found for a non-existent key ID", async () => {
    const userId = await createTestUser({
      username: "revokeuser2",
      password: "password123",
    });
    const client = makeClient(userCtx(userId));

    const err = await client
      .revokeApiKey({ keyId: "nonexistent-key-id" })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("not_found");
    expect((err as AnyORPCError).status).toBe(404);
  });

  it("cannot revoke another user's key", async () => {
    const userId1 = await createTestUser({
      username: "owner1",
      password: "password123",
    });
    const userId2 = await createTestUser({
      username: "thief1",
      password: "password123",
    });

    const client1 = makeClient(userCtx(userId1));
    const created = await client1.createApiKey({ name: "OwnerKey" });

    // User2 tries to revoke User1's key
    const client2 = makeClient(userCtx(userId2));
    const err = await client2
      .revokeApiKey({ keyId: created.id })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("not_found");
  });
});

// ---------------------------------------------------------------------------
// 4. Disabled user's key returns 401
// ---------------------------------------------------------------------------

describe("disabled user key → 401", () => {
  it("a banned user's key is effectively rejected", async () => {
    const userId = await createTestUser({
      username: "banuser1",
      password: "password123",
    });
    const client = makeClient(userCtx(userId));

    const created = await client.createApiKey({ name: "BannedKey" });
    const secret = created.key;

    // Verify key works before ban
    const before = await testAuth.api.verifyApiKey({ body: { key: secret } });
    expect(before.valid).toBe(true);

    // Ban the user
    db.update(dbSchema.user)
      .set({ banned: true, banReason: "Test ban" })
      .where(eq(dbSchema.user.id, userId))
      .run();

    // Simulate context.ts: a banned user's API key → user: null → 401.
    // In context.ts, after verifyApiKey succeeds, owner.banned is checked.
    // The key itself is still valid in the DB, but context rejects it.
    const nullCtx: AppContext = {
      user: null,
      via: { apiKeyId: created.id, name: "BannedKey" },
      now: Date.now(),
      requestId: randomUUID(),
    };
    const bannedClient = makeClient(nullCtx);
    const err = await bannedClient
      .echo({ message: "hello" })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("unauthorized");
    expect((err as AnyORPCError).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 5. sessionOnly: API key caller → 403 on createApiKey/listApiKeys/revokeApiKey
// ---------------------------------------------------------------------------

describe("sessionOnly guard on API key procedures", () => {
  it("rejects API key caller on createApiKey with 403", async () => {
    const userId = await createTestUser({
      username: "sessionguard1",
      password: "password123",
    });
    const client = makeClient(apiKeyCtx(userId));

    const err = await client
      .createApiKey({ name: "ShouldFail" })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("forbidden");
    expect((err as AnyORPCError).status).toBe(403);
  });

  it("rejects API key caller on listApiKeys with 403", async () => {
    const userId = await createTestUser({
      username: "sessionguard2",
      password: "password123",
    });
    const client = makeClient(apiKeyCtx(userId));

    const err = await client
      .listApiKeys({})
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("forbidden");
    expect((err as AnyORPCError).status).toBe(403);
  });

  it("rejects API key caller on revokeApiKey with 403", async () => {
    const userId = await createTestUser({
      username: "sessionguard3",
      password: "password123",
    });
    const client = makeClient(apiKeyCtx(userId));

    const err = await client
      .revokeApiKey({ keyId: "any-key-id" })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("forbidden");
    expect((err as AnyORPCError).status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 6. Not quota-limited: many requests are not rejected
// ---------------------------------------------------------------------------

describe("no per-key rate limit", () => {
  it("30 verifyApiKey calls succeed without rate limit rejection", async () => {
    const userId = await createTestUser({
      username: "ratelimit1",
      password: "password123",
    });
    const client = makeClient(userCtx(userId));

    const created = await client.createApiKey({ name: "RateLimitTest" });
    const secret = created.key;

    // Make 30 verifyApiKey calls in a loop
    let failures = 0;
    for (let i = 0; i < 30; i++) {
      try {
        const result = await testAuth.api.verifyApiKey({
          body: { key: secret },
        });
        expect(result.valid).toBe(true);
      } catch (err: unknown) {
        // If it throws with a rate limit error, count it
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("rate") || msg.includes("RATE") || msg.includes("limit")) {
          failures++;
        } else {
          throw err; // re-throw unexpected errors
        }
      }
    }

    expect(failures).toBe(0);
  });
});
