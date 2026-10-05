/**
 * Tests for the oRPC base (task 3.2).
 *
 * Covers:
 *  - Error code → HTTP status mapping table
 *  - member middleware: anonymous context → 401
 *  - member middleware: API-key caller is allowed; sessionOnly → 403
 *  - Banned owner's API key → 401 (via getContext + real in-memory DB)
 *  - Unknown error → internal_error (500) with generic message + logged requestId
 *  - Validation failure → validation_error (400) with details[{path, message}]
 */

// Point the global db singleton at an in-memory DB before any module loads.
import { vi, describe, it, expect, beforeAll } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "file::memory:?cache=shared";
});

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { ORPCError } from "@orpc/server";
import { createRouterClient } from "@orpc/server";

// Convenience alias to avoid repeating type parameters on every cast.
type AnyORPCError = ORPCError<string, unknown>;
import * as z from "zod";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db, sqlite } from "../db";
import { user as userTable } from "../db/schema";
import { auth } from "./auth";
import { MIGRATIONS_FOLDER } from "../db/testing";
import {
  ERROR_STATUS_MAP,
  base,
  member,
  admin,
  validationInterceptor,
} from "./orpc";
import { router } from "./router";
import { getContext } from "./context";
import type { AppContext } from "./context";

// ---------------------------------------------------------------------------
// Global setup: apply migrations to the in-memory DB
// ---------------------------------------------------------------------------

beforeAll(() => {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal anonymous AppContext. */
function anonCtx(overrides?: Partial<AppContext>): AppContext {
  return {
    user: null,
    via: "web",
    now: Date.now(),
    requestId: randomUUID(),
    ...overrides,
  };
}

/** Build a minimal authenticated AppContext with an optional via channel. */
function userCtx(
  userId = "user-test",
  role = "user",
  via: AppContext["via"] = "web",
): AppContext {
  return {
    user: {
      id: userId,
      name: userId,
      email: `${userId}@users.hearth.invalid`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      role,
    } as AppContext["user"],
    via,
    now: Date.now(),
    requestId: randomUUID(),
  };
}

/**
 * Create a router client with the validation interceptor and a fixed context.
 * This mirrors how adapters call procedures (task 3.4).
 */
function makeClient(ctx: AppContext) {
  return createRouterClient(router, {
    context: ctx,
    interceptors: [validationInterceptor],
  });
}

// ---------------------------------------------------------------------------
// 1. Error code → HTTP status mapping
// ---------------------------------------------------------------------------

describe("ERROR_STATUS_MAP", () => {
  const cases: Array<[keyof typeof ERROR_STATUS_MAP, number]> = [
    ["validation_error", 400],
    ["unauthorized", 401],
    ["forbidden", 403],
    ["not_found", 404],
    ["conflict", 409],
    ["rate_limited", 429],
    ["internal_error", 500],
  ];

  it.each(cases)("%s maps to %d", (code, expected) => {
    expect(ERROR_STATUS_MAP[code]).toBe(expected);
  });

  it("throws ORPCError with the correct status for each code", () => {
    for (const [code, status] of cases) {
      const err = new ORPCError(code, { status });
      expect(err.status).toBe(status);
      expect(err.code).toBe(code);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. member middleware
// ---------------------------------------------------------------------------

describe("member middleware", () => {
  it("rejects an anonymous context with unauthorized (401)", async () => {
    const ctx = anonCtx();
    const proc = member.input(z.object({})).handler(() => ({ ok: true }));
    const client = createRouterClient(proc, {
      context: ctx,
      interceptors: [validationInterceptor],
    });
    const err = await client({}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("unauthorized");
    expect((err as AnyORPCError).status).toBe(401);
  });

  it("allows an authenticated API-key caller through member", async () => {
    const ctx = userCtx("u1", "user", { apiKeyId: "key1", name: "Claude" });
    const proc = member.input(z.object({})).handler(() => ({ ok: true }));
    const client = createRouterClient(proc, {
      context: ctx,
      interceptors: [validationInterceptor],
    });
    const result = await client({});
    expect(result).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// 3. sessionOnly middleware
// ---------------------------------------------------------------------------

describe("sessionOnly middleware", () => {
  it("allows a web-session caller", async () => {
    const ctx = userCtx("u2", "user", "web");
    const client = makeClient(ctx);
    const result = await client.me({});
    expect(result.id).toBe("u2");
  });

  it("rejects an API-key caller with forbidden (403)", async () => {
    const ctx = userCtx("u3", "user", { apiKeyId: "key2", name: "Claude" });
    const client = makeClient(ctx);
    const err = await client.me({}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("forbidden");
    expect((err as AnyORPCError).status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 4. admin middleware
// ---------------------------------------------------------------------------

describe("admin middleware", () => {
  it("allows a user with admin role", async () => {
    const ctx = userCtx("u-admin", "admin", "web");
    const proc = admin.input(z.object({})).handler(() => ({ ok: true }));
    const client = createRouterClient(proc, {
      context: ctx,
      interceptors: [validationInterceptor],
    });
    const result = await client({});
    expect(result).toEqual({ ok: true });
  });

  it("rejects a non-admin user with forbidden (403)", async () => {
    const ctx = userCtx("u-regular", "user", "web");
    const proc = admin.input(z.object({})).handler(() => ({ ok: true }));
    const client = createRouterClient(proc, {
      context: ctx,
      interceptors: [validationInterceptor],
    });
    const err = await client({}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("forbidden");
    expect((err as AnyORPCError).status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 5. Banned owner's API key → 401
//    Creates a real user in the in-memory DB, creates an API key, bans the
//    user, then verifies getContext returns user: null (which leads to 401
//    when member is applied).
// ---------------------------------------------------------------------------

describe("banned user API key", () => {
  it("getContext returns user: null for a banned owner's key", async () => {
    // Insert a user directly — auth.api.signUpEmail is disabled.
    const userId = "banned-user-test-" + randomUUID();
    sqlite
      .prepare(
        `INSERT INTO user
         (id, name, email, email_verified, created_at, updated_at, username, role)
         VALUES (?, ?, ?, 0, unixepoch()*1000, unixepoch()*1000, ?, 'user')`,
      )
      .run(
        userId,
        "Banned Test",
        `${userId}@users.hearth.invalid`,
        userId.slice(0, 20),
      );

    // Create an API key for the user (server-side call — no session needed).
    const keyResult = await auth.api.createApiKey({
      body: { userId, name: "Test Key" },
    });
    const rawKey: string = (keyResult as Record<string, unknown>).key as string;
    expect(rawKey).toBeTruthy();

    // Verify the key works before the ban.
    const ctxBefore = await getContext(
      new Request("http://localhost/test", {
        headers: { Authorization: `Bearer ${rawKey}` },
      }),
    );
    expect(ctxBefore.user).not.toBeNull();

    // Ban the user directly in the DB.
    db.update(userTable).set({ banned: true }).where(eq(userTable.id, userId)).run();

    // Now the key should resolve to user: null.
    const ctxAfter = await getContext(
      new Request("http://localhost/test", {
        headers: { Authorization: `Bearer ${rawKey}` },
      }),
    );
    expect(ctxAfter.user).toBeNull();

    // And calling a member procedure with this context gives 401.
    const proc = member.input(z.object({})).handler(() => ({ ok: true }));
    const client = createRouterClient(proc, {
      context: ctxAfter,
      interceptors: [validationInterceptor],
    });
    const err = await client({}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("unauthorized");
    expect((err as AnyORPCError).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 6. Unknown error → internal_error with logged requestId
// ---------------------------------------------------------------------------

describe("validationInterceptor – unknown error", () => {
  it("converts a plain Error to internal_error (500) with generic message", async () => {
    const ctx = userCtx("u4", "user", "web");
    const proc = base.input(z.object({})).handler(() => {
      throw new Error("Something exploded");
    });
    const client = createRouterClient(proc, {
      context: ctx,
      interceptors: [validationInterceptor],
    });

    const err = await client({}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("internal_error");
    expect((err as AnyORPCError).status).toBe(500);
    expect((err as AnyORPCError).message).not.toContain("Something exploded");
    expect((err as AnyORPCError).message).toBe("An unexpected error occurred.");
  });

  it("logs the requestId alongside the internal error", async () => {
    const requestId = "test-req-id-" + randomUUID();
    const ctx = userCtx("u5", "user", "web");
    ctx.requestId = requestId;

    const proc = base.input(z.object({})).handler(() => {
      throw new Error("Boom");
    });

    const logged: unknown[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      logged.push(...args);
    };

    try {
      const client = createRouterClient(proc, {
        context: ctx,
        interceptors: [validationInterceptor],
      });
      await client({}).catch(() => {});
    } finally {
      console.error = origError;
    }

    // The requestId must appear somewhere in the log output.
    const logLine = logged.join(" ");
    expect(logLine).toContain(requestId);
  });
});

// ---------------------------------------------------------------------------
// 7. Validation failure → validation_error with details
// ---------------------------------------------------------------------------

describe("validationInterceptor – validation error", () => {
  it("maps Zod validation failure to validation_error (400) with details", async () => {
    const ctx = anonCtx(); // validation runs before auth middleware
    const proc = base
      .input(
        z.object({
          title: z.string().min(1, "Title is required"),
          count: z.number({ message: "Count must be a number" }),
        }),
      )
      .handler(() => ({ ok: true }));

    const client = createRouterClient(proc, {
      context: ctx,
      interceptors: [validationInterceptor],
    });

    const err = await client({} as never).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ORPCError);
    expect((err as AnyORPCError).code).toBe("validation_error");
    expect((err as AnyORPCError).status).toBe(400);

    const data = (err as AnyORPCError).data as { details: Array<{ path: string; message: string }> };
    expect(Array.isArray(data.details)).toBe(true);
    expect(data.details.length).toBeGreaterThan(0);
    // Each detail has path (string) and message
    for (const detail of data.details) {
      expect(typeof detail.path).toBe("string");
      expect(typeof detail.message).toBe("string");
    }
  });

  it("includes the requestId in validation_error data", async () => {
    const requestId = "val-req-" + randomUUID();
    const ctx = anonCtx({ requestId });
    const proc = base
      .input(z.object({ name: z.string() }))
      .handler(() => ({ ok: true }));

    const client = createRouterClient(proc, {
      context: ctx,
      interceptors: [validationInterceptor],
    });

    const err = await client({} as never).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ORPCError);
    const data = (err as AnyORPCError).data as Record<string, unknown>;
    expect(data.requestId).toBe(requestId);
  });
});

// ---------------------------------------------------------------------------
// 8. requestId is threaded into known ORPCErrors
// ---------------------------------------------------------------------------

describe("validationInterceptor – requestId in ORPCErrors", () => {
  it("injects requestId into member-thrown unauthorized error", async () => {
    const requestId = "orpc-req-" + randomUUID();
    const ctx = anonCtx({ requestId });
    const proc = member.input(z.object({})).handler(() => ({ ok: true }));

    const client = createRouterClient(proc, {
      context: ctx,
      interceptors: [validationInterceptor],
    });

    const err = await client({}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ORPCError);
    const data = (err as AnyORPCError).data as Record<string, unknown>;
    expect(data.requestId).toBe(requestId);
  });
});

// ---------------------------------------------------------------------------
// 9. encodeErrorBody
// ---------------------------------------------------------------------------

describe("encodeErrorBody", () => {
  it("emits the spec-defined error body shape", async () => {
    const { encodeErrorBody } = await import("./orpc");
    const err = new ORPCError("not_found", {
      status: 404,
      message: "Entity not found.",
      data: { requestId: "req-123" },
    });
    const body = encodeErrorBody(err);
    expect(body).toEqual({
      error: {
        code: "not_found",
        message: "Entity not found.",
        details: undefined,
        requestId: "req-123",
      },
    });
  });

  it("includes details when present", async () => {
    const { encodeErrorBody } = await import("./orpc");
    const details = [{ path: "title", message: "Required" }];
    const err = new ORPCError("validation_error", {
      status: 400,
      message: "Validation failed.",
      data: { details, requestId: "req-456" },
    });
    const body = encodeErrorBody(err);
    expect(body.error.details).toEqual(details);
    expect(body.error.requestId).toBe("req-456");
  });
});
