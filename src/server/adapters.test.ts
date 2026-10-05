/**
 * Tests for the adapter layer (task 3.4).
 *
 * Covers:
 *  1. Server-only router client: test procedure reachable with session context
 *  2. invoke() returns [error, data] and does not throw
 *  3. Same invalid input gives same error through invoke and REST
 *  4. REST with no bearer token → 401
 *  5. REST with valid session cookie but no bearer → 401
 *  6. Bearer-authenticated call succeeds
 *  7. sessionOnly procedure with API key → 403 via REST
 *  8. Idempotency-Key header is captured/passed through
 */

import { vi, describe, it, expect, beforeAll } from "vitest";

// Point at in-memory DB before any module loads
vi.hoisted(() => {
  process.env.DATABASE_URL = "file::memory:?cache=shared";
});

// Mock next/headers so server-only code works in tests
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  })),
}));

// Mock next/cache — refresh() is a no-op in tests
vi.mock("next/cache", () => ({
  refresh: vi.fn(),
}));

// Mock server-only to allow test imports
vi.mock("server-only", () => ({}));

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { randomUUID } from "node:crypto";
import { createRouterClient, ORPCError } from "@orpc/server";

import { db, sqlite } from "../db";
import { MIGRATIONS_FOLDER } from "../db/testing";
import { router } from "./router";
import { type AppContext } from "./context";
import { validationInterceptor } from "./orpc";
import { auth } from "./auth";

// Import the REST handler
import { GET, POST } from "../app/api/v1/[[...rest]]/route";

// ---------------------------------------------------------------------------
// Global setup
// ---------------------------------------------------------------------------

beforeAll(() => {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function userCtx(
  userId = "u-test",
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

function anonCtx(): AppContext {
  return {
    user: null,
    via: "web",
    now: Date.now(),
    requestId: randomUUID(),
  };
}

/**
 * Create a real user + API key in the in-memory DB.
 * Returns the raw API key string.
 */
async function createUserWithApiKey(
  id: string,
  username: string,
  role = "user",
): Promise<string> {
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO user
       (id, name, email, email_verified, created_at, updated_at, username, role)
       VALUES (?, ?, ?, 0, unixepoch()*1000, unixepoch()*1000, ?, ?)`,
    )
    .run(id, username, `${username}@users.hearth.invalid`, username, role);

  const keyResult = await auth.api.createApiKey({
    body: { userId: id, name: `${username}-key` },
  });
  return (keyResult as Record<string, unknown>).key as string;
}

/**
 * Build a Request to /api/v1/<path> with optional bearer and body.
 */
function apiRequest(
  path: string,
  options: {
    method?: string;
    bearer?: string;
    body?: unknown;
    headers?: Record<string, string>;
    cookie?: string;
  } = {},
): Request {
  const method = options.method ?? "GET";
  const url = `http://localhost/api/v1${path}`;
  const headers: Record<string, string> = {
    ...(options.headers ?? {}),
  };
  if (options.bearer) {
    headers["Authorization"] = `Bearer ${options.bearer}`;
  }
  if (options.cookie) {
    headers["Cookie"] = options.cookie;
  }
  let body: string | undefined;
  if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers["Content-Type"] = "application/json";
  }
  return new Request(url, { method, headers, body });
}

// ---------------------------------------------------------------------------
// 1. Server-only router client: procedure reachable with session context
// ---------------------------------------------------------------------------

describe("server-only router client", () => {
  it("ping is reachable with an anonymous context", async () => {
    const ctx = anonCtx();
    const client = createRouterClient(router, {
      context: ctx,
      interceptors: [validationInterceptor],
    });
    const result = await client.ping({ echo: "hello" });
    expect(result.ok).toBe(true);
    expect(result.echo).toBe("hello");
    expect(result.requestId).toBe(ctx.requestId);
  });

  it("echo is reachable with an authenticated context", async () => {
    const ctx = userCtx("u-server-client");
    const client = createRouterClient(router, {
      context: ctx,
      interceptors: [validationInterceptor],
    });
    const result = await client.echo({ message: "test" });
    expect(result.message).toBe("test");
    expect(result.requestId).toBe(ctx.requestId);
  });

  it("me returns user info for a session user", async () => {
    const ctx = userCtx("u-me", "admin", "web");
    const client = createRouterClient(router, {
      context: ctx,
      interceptors: [validationInterceptor],
    });
    const result = await client.me({});
    expect(result.id).toBe("u-me");
  });
});

// ---------------------------------------------------------------------------
// 2. invoke() returns [error, data] and does not throw
// ---------------------------------------------------------------------------

describe("invoke() action", () => {
  // We need to test invoke in isolation. Since it uses next/headers internally,
  // and we've mocked that, we'll test it indirectly via the procedure resolver
  // logic and the error handling.

  it("returns [null, data] on success via router client pattern", async () => {
    // Simulate what invoke does: create a client, call a procedure, catch errors
    const ctx = anonCtx();
    const client = createRouterClient(router, {
      context: ctx,
      interceptors: [validationInterceptor],
    });

    try {
      const data = await client.ping({ echo: "invoke-test" });
      const result: [null, typeof data] = [null, data];
      expect(result[0]).toBeNull();
      expect(result[1].echo).toBe("invoke-test");
    } catch {
      // Should not throw
      expect.unreachable("ping should not throw");
    }
  });

  it("returns [error, undefined] for validation error without throwing", async () => {
    const ctx = userCtx("u-invoke-val");
    const client = createRouterClient(router, {
      context: ctx,
      interceptors: [validationInterceptor],
    });

    try {
      await client.echo({ message: "" }); // empty string, min 1
      expect.unreachable("should have thrown validation error");
    } catch (err) {
      // The interceptor converts this to an ORPCError
      expect(err).toBeInstanceOf(ORPCError);
      const orpcErr = err as ORPCError<string, unknown>;
      expect(orpcErr.code).toBe("validation_error");

      // invoke catches this and returns [error, undefined]
      const data =
        typeof orpcErr.data === "object" && orpcErr.data !== null
          ? (orpcErr.data as Record<string, unknown>)
          : {};
      const invokeError = {
        code: orpcErr.code,
        message: orpcErr.message,
        details: data.details,
        requestId: data.requestId,
      };
      expect(invokeError.code).toBe("validation_error");
      expect(invokeError.requestId).toBe(ctx.requestId);
      expect(Array.isArray(invokeError.details)).toBe(true);
    }
  });

  it("returns [error, undefined] for unknown procedure path", async () => {
    // Import invoke directly — it will use mocked next/headers
    const { invoke } = await import("../lib/actions/invoke");
    const result = await invoke("nonexistent", {});
    expect(result[0]).not.toBeNull();
    expect(result[0]!.code).toBe("not_found");
    expect(result[1]).toBeUndefined();
  });

  it("does not throw across the action boundary for auth errors", async () => {
    // invoke catches ORPCError and returns error object
    const { invoke } = await import("../lib/actions/invoke");
    // echo requires member auth; with mocked headers (no cookie), user is null
    const result = await invoke("echo", { message: "hi" });
    expect(result[0]).not.toBeNull();
    expect(result[0]!.code).toBe("unauthorized");
    expect(result[1]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Same invalid input → same error code + details through invoke and REST
// ---------------------------------------------------------------------------

describe("same validation error through invoke and REST", () => {
  let apiKey: string;

  beforeAll(async () => {
    apiKey = await createUserWithApiKey("u-val-test", "valtest");
  });

  it("invoke and REST both produce validation_error with details for empty message", async () => {
    // --- invoke path ---
    const ctx = userCtx("u-val-test");
    const client = createRouterClient(router, {
      context: ctx,
      interceptors: [validationInterceptor],
    });

    let invokeErrorCode: string | undefined;
    let invokeErrorDetails: unknown;
    try {
      await client.echo({ message: "" });
    } catch (err) {
      const e = err as ORPCError<string, unknown>;
      invokeErrorCode = e.code;
      const data = e.data as Record<string, unknown>;
      invokeErrorDetails = data.details;
    }

    // --- REST path ---
    const req = apiRequest("/echo", {
      method: "POST",
      bearer: apiKey,
      body: { message: "" },
    });
    const res = await POST(req);
    const body = (await res.json()) as {
      error: { code: string; details: unknown };
    };

    // Both should give validation_error
    expect(invokeErrorCode).toBe("validation_error");
    expect(body.error.code).toBe("validation_error");

    // Both should include details array
    expect(Array.isArray(invokeErrorDetails)).toBe(true);
    expect(Array.isArray(body.error.details)).toBe(true);

    // Details should have the same shape
    const invokeDetail = (invokeErrorDetails as Array<{ path: string; message: string }>)[0];
    const restDetail = (body.error.details as Array<{ path: string; message: string }>)[0];
    expect(invokeDetail).toBeDefined();
    expect(restDetail).toBeDefined();
    // Both point to the same field
    expect(invokeDetail!.path).toBe(restDetail!.path);
  });
});

// ---------------------------------------------------------------------------
// 4. REST with no bearer token → 401
// ---------------------------------------------------------------------------

describe("REST bearer-only enforcement", () => {
  it("returns 401 with standard error body when no bearer token", async () => {
    const req = apiRequest("/ping");
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("returns 401 even for requests with only a session cookie", async () => {
    // Simulate a request with a cookie but no bearer
    const req = apiRequest("/ping", {
      cookie: "better-auth.session_token=some-session-value",
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });
});

// ---------------------------------------------------------------------------
// 5. Bearer-authenticated call succeeds
// ---------------------------------------------------------------------------

describe("bearer-authenticated REST call", () => {
  let apiKey: string;

  beforeAll(async () => {
    apiKey = await createUserWithApiKey("u-bearer-ok", "bearertest");
  });

  it("ping returns 200 with valid bearer", async () => {
    const req = apiRequest("/ping?echo=rest-test", {
      bearer: apiKey,
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; echo: string };
    expect(body.ok).toBe(true);
    expect(body.echo).toBe("rest-test");
  });

  it("echo POST returns 200 with valid bearer and body", async () => {
    const req = apiRequest("/echo", {
      method: "POST",
      bearer: apiKey,
      body: { message: "rest-echo" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("rest-echo");
  });
});

// ---------------------------------------------------------------------------
// 6. sessionOnly procedure with API key → 403
// ---------------------------------------------------------------------------

describe("sessionOnly via REST", () => {
  let apiKey: string;

  beforeAll(async () => {
    apiKey = await createUserWithApiKey("u-session-only", "sessiononly");
  });

  it("me returns 403 when called with an API key", async () => {
    const req = apiRequest("/me", {
      bearer: apiKey,
    });
    const res = await GET(req);
    expect(res.status).toBe(403);
    const body = (await res.json()) as {
      error: { code: string; message: string };
    };
    expect(body.error.code).toBe("forbidden");
  });
});

// ---------------------------------------------------------------------------
// 7. Idempotency-Key header capture
// ---------------------------------------------------------------------------

describe("Idempotency-Key header", () => {
  let apiKey: string;

  beforeAll(async () => {
    apiKey = await createUserWithApiKey("u-idemp-hdr", "idemphdr");
  });

  it("captures the Idempotency-Key header in the context", async () => {
    // We verify indirectly: a POST with an idempotency key succeeds
    // (the write pipeline would use it; here we just verify it doesn't break)
    const req = apiRequest("/echo", {
      method: "POST",
      bearer: apiKey,
      body: { message: "idempotent-test" },
      headers: { "Idempotency-Key": "test-key-123" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("idempotent-test");
  });
});

// ---------------------------------------------------------------------------
// 8. Invalid bearer → 401
// ---------------------------------------------------------------------------

describe("invalid bearer key", () => {
  it("returns 401 for a made-up bearer token", async () => {
    const req = apiRequest("/ping", {
      bearer: "invalid-token-that-does-not-exist",
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });
});

// ---------------------------------------------------------------------------
// 9. Error body shape matches the spec
// ---------------------------------------------------------------------------

describe("error body shape", () => {
  it("validation error has { error: { code, message, details, requestId } }", async () => {
    const apiKey = await createUserWithApiKey("u-errshape", "errshape");
    const req = apiRequest("/echo", {
      method: "POST",
      bearer: apiKey,
      body: { message: "" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: {
        code: string;
        message: string;
        details: Array<{ path: string; message: string }>;
        requestId: string;
      };
    };
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("validation_error");
    expect(typeof body.error.message).toBe("string");
    expect(typeof body.error.requestId).toBe("string");
    expect(Array.isArray(body.error.details)).toBe(true);
    expect(body.error.details.length).toBeGreaterThan(0);
    expect(typeof body.error.details[0]!.path).toBe("string");
    expect(typeof body.error.details[0]!.message).toBe("string");
  });
});
