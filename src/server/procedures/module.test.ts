/**
 * Tests for module procedure generator (task 6.2 + 6.3).
 *
 * Uses createTestDatabase() with an in-memory SQLite, seeds a user,
 * and exercises generated procedures through the router client and REST.
 *
 * Covers:
 *  1. create/list/get/update/archive/unarchive/delete/restore
 *  2. Validation errors (bad field type, bad enum, title too long)
 *  3. Cursor pagination (>limit → nextCursor; changed sort → 400)
 *  4. Stale version conflict (409) and unversioned update
 *  5. Disabled feature → 403
 *  6. CRUD through REST handler
 */

import { vi, describe, it, expect, beforeAll } from "vitest";

// Use an in-memory DB so the suite is hermetic (vitest.config does not set
// DATABASE_URL); the global `db` singleton otherwise opens data/hearth.db.
vi.hoisted(() => {
  process.env.DATABASE_URL = "file::memory:?cache=shared";
});

import { randomUUID } from "node:crypto";
import {
  checkFeatureEnabled,
} from "./module";
import { notesPageDefinition } from "../../modules/notes-page/definition";
import { notesPageServer } from "../../modules/notes-page/server";
import type { AnyModuleRecord, ModuleDefinition, AnyModuleServer, ModuleUI } from "../../modules/types";
import { ORPCError, createRouterClient } from "@orpc/server";
import { validationInterceptor } from "../orpc";
import type { AppContext } from "../context";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(userId: string): AppContext {
  return {
    user: {
      id: userId,
      name: userId,
      email: `${userId}@users.hearth.invalid`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      role: "user",
    } as AppContext["user"],
    via: "web",
    now: Date.now(),
    requestId: randomUUID(),
  };
}

/** Build the notes-page AnyModuleRecord for the procedure generator. */
function notesPageRecord(): AnyModuleRecord {
  return {
    definition: notesPageDefinition as ModuleDefinition,
    server: notesPageServer as AnyModuleServer,
    ui: { type: "notes-page" } as ModuleUI,
  };
}

/**
 * We override db in the module.ts to use the test DB.
 * Since module.ts imports `db` from `../../db`, and tests can't easily
 * redirect that, we'll use a direct-SQL approach by calling the generated
 * procedures through the router client pattern.
 *
 * However, generated procedures use the global `db` singleton.
 * For unit tests we'll need to mock it or use the global in-memory DB.
 *
 * The vitest.config already sets DATABASE_URL, and createTestDatabase
 * creates a separate :memory: DB. The generated procedures use the
 * globally-imported `db` from src/db/index.ts. We'll set up the global DB.
 */

// We need the global db to be the test database. Since the global db is
// already opened by the import of src/db/index.ts, and we can't swap it,
// we'll use the global db (which already has migrations applied in beforeAll).

import { db, sqlite } from "../../db";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { MIGRATIONS_FOLDER } from "../../db/testing";

// Import the router and REST handlers for REST tests
import { router } from "../router";
import { POST, GET } from "../../app/api/v1/[[...rest]]/route";
import { auth } from "../auth";

// ---------------------------------------------------------------------------
// Global setup — use the global in-memory DB
// ---------------------------------------------------------------------------

beforeAll(() => {
  // The global `db` from src/db/index.ts should already be an in-memory DB
  // (DATABASE_URL = file::memory:?cache=shared via vitest env).
  // Apply migrations to it.
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

function seedUserGlobal(id: string, username: string, role = "user") {
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO user
       (id, name, email, email_verified, created_at, updated_at, username, role)
       VALUES (?, ?, ?, 0, unixepoch()*1000, unixepoch()*1000, ?, ?)`,
    )
    .run(id, username, `${username}@users.hearth.invalid`, username, role);
}

// Unique prefix for each test run to avoid collisions
const PREFIX = randomUUID().slice(0, 8);
const USER_ID = `u-mod-${PREFIX}`;

beforeAll(() => {
  seedUserGlobal(USER_ID, `modtest-${PREFIX}`);
});

function ctx(): AppContext {
  return makeCtx(USER_ID);
}

// ---------------------------------------------------------------------------
// Router client helper for testing
// ---------------------------------------------------------------------------

function client(appCtx?: AppContext) {
  const c = appCtx ?? ctx();
  return createRouterClient(router, {
    context: c,
    interceptors: [validationInterceptor],
  });
}

// ---------------------------------------------------------------------------
// 1. create / list / get / update / archive / unarchive / delete / restore
// ---------------------------------------------------------------------------

describe("notes-page CRUD through procedures", () => {
  let entityId: string;

  it("create", async () => {
    const c = client();
    const result = await (c as Record<string, CallableFunction>)
      .notesPageCreate({
        title: "Test Note",
        category: "reference",
        reviewOn: "2025-06-01",
      });
    const entity = result as Record<string, unknown>;
    expect(entity.id).toBeDefined();
    expect(entity.type).toBe("notes-page");
    expect(entity.title).toBe("Test Note");
    expect(entity.category).toBe("reference");
    expect(entity.reviewOn).toBe("2025-06-01");
    expect(entity.version).toBe(1);
    entityId = entity.id as string;
  });

  it("get", async () => {
    const c = client();
    const entity = (await (c as Record<string, CallableFunction>)
      .notesPageGet({ id: entityId })) as Record<string, unknown>;
    expect(entity.id).toBe(entityId);
    expect(entity.title).toBe("Test Note");
    expect(entity.category).toBe("reference");
  });

  it("list", async () => {
    const c = client();
    const result = (await (c as Record<string, CallableFunction>)
      .notesPageList({})) as { data: unknown[]; nextCursor: string | null };
    expect(Array.isArray(result.data)).toBe(true);
    const found = (result.data as Array<Record<string, unknown>>).find(
      (e) => e.id === entityId,
    );
    expect(found).toBeDefined();
    expect(found!.title).toBe("Test Note");
  });

  it("update", async () => {
    const c = client();
    const result = (await (c as Record<string, CallableFunction>)
      .notesPageUpdate({
        id: entityId,
        data: { title: "Updated Note", category: "how-to" },
      })) as Record<string, unknown>;
    expect(result.title).toBe("Updated Note");
    expect(result.category).toBe("how-to");
    expect(result.version).toBe(2);
  });

  it("archive", async () => {
    const c = client();
    const result = (await (c as Record<string, CallableFunction>)
      .notesPageArchive({ id: entityId })) as { ok: boolean };
    expect(result.ok).toBe(true);

    // Archived entity should not appear in default list
    const listResult = (await (c as Record<string, CallableFunction>)
      .notesPageList({})) as { data: unknown[] };
    const found = (listResult.data as Array<Record<string, unknown>>).find(
      (e) => e.id === entityId,
    );
    expect(found).toBeUndefined();
  });

  it("unarchive", async () => {
    const c = client();
    const result = (await (c as Record<string, CallableFunction>)
      .notesPageUnarchive({ id: entityId })) as { ok: boolean };
    expect(result.ok).toBe(true);

    // Entity should be back in the list
    const listResult = (await (c as Record<string, CallableFunction>)
      .notesPageList({})) as { data: unknown[] };
    const found = (listResult.data as Array<Record<string, unknown>>).find(
      (e) => e.id === entityId,
    );
    expect(found).toBeDefined();
  });

  it("delete (soft)", async () => {
    const c = client();
    const result = (await (c as Record<string, CallableFunction>)
      .notesPageDelete({ id: entityId })) as { ok: boolean };
    expect(result.ok).toBe(true);

    // Deleted entity should not appear in list
    const listResult = (await (c as Record<string, CallableFunction>)
      .notesPageList({})) as { data: unknown[] };
    const found = (listResult.data as Array<Record<string, unknown>>).find(
      (e) => e.id === entityId,
    );
    expect(found).toBeUndefined();

    // get should return 404
    try {
      await (c as Record<string, CallableFunction>).notesPageGet({
        id: entityId,
      });
      expect.unreachable("should have thrown not_found");
    } catch (err) {
      expect((err as ORPCError<string, unknown>).code).toBe("not_found");
    }
  });

  it("restore", async () => {
    const c = client();
    const result = (await (c as Record<string, CallableFunction>)
      .notesPageRestore({ id: entityId })) as { ok: boolean };
    expect(result.ok).toBe(true);

    // Entity should be accessible again
    const entity = (await (c as Record<string, CallableFunction>)
      .notesPageGet({ id: entityId })) as Record<string, unknown>;
    expect(entity.id).toBe(entityId);
  });
});

// ---------------------------------------------------------------------------
// 2. Validation errors
// ---------------------------------------------------------------------------

describe("validation errors", () => {
  it("title too long → validation_error", async () => {
    const c = client();
    try {
      await (c as Record<string, CallableFunction>).notesPageCreate({
        title: "x".repeat(201),
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as ORPCError<string, unknown>).code).toBe(
        "validation_error",
      );
    }
  });

  it("invalid enum value → validation_error", async () => {
    const c = client();
    try {
      await (c as Record<string, CallableFunction>).notesPageCreate({
        title: "Valid Title",
        category: "invalid-category",
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as ORPCError<string, unknown>).code).toBe(
        "validation_error",
      );
    }
  });

  it("missing required title → validation_error", async () => {
    const c = client();
    try {
      await (c as Record<string, CallableFunction>).notesPageCreate({});
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as ORPCError<string, unknown>).code).toBe(
        "validation_error",
      );
    }
  });

  it("invalid sort field → validation_error", async () => {
    const c = client();
    try {
      await (c as Record<string, CallableFunction>).notesPageList({
        sort: "nonexistent",
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as ORPCError<string, unknown>).code).toBe(
        "validation_error",
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Cursor pagination
// ---------------------------------------------------------------------------

describe("cursor pagination", () => {
  const createdIds: string[] = [];

  beforeAll(async () => {
    // Create 5 entities for pagination testing
    const c = client();
    for (let i = 0; i < 5; i++) {
      const result = (await (c as Record<string, CallableFunction>)
        .notesPageCreate({
          title: `Paginate ${PREFIX} ${String(i).padStart(2, "0")}`,
          category: i % 2 === 0 ? "reference" : "how-to",
        })) as Record<string, unknown>;
      createdIds.push(result.id as string);
    }
  });

  it("returns nextCursor when more items exist", async () => {
    const c = client();
    const result = (await (c as Record<string, CallableFunction>)
      .notesPageList({ limit: 2 })) as {
      data: unknown[];
      nextCursor: string | null;
    };
    expect(result.data).toHaveLength(2);
    expect(result.nextCursor).not.toBeNull();
  });

  it("using nextCursor returns the next page", async () => {
    const c = client();
    const page1 = (await (c as Record<string, CallableFunction>)
      .notesPageList({
        limit: 2,
        sort: "updatedAt",
      })) as {
      data: Array<Record<string, unknown>>;
      nextCursor: string | null;
    };
    expect(page1.nextCursor).not.toBeNull();

    const page2 = (await (c as Record<string, CallableFunction>)
      .notesPageList({
        limit: 2,
        sort: "updatedAt",
        cursor: page1.nextCursor!,
      })) as {
      data: Array<Record<string, unknown>>;
      nextCursor: string | null;
    };
    expect(page2.data.length).toBeGreaterThanOrEqual(1);

    // Pages should not overlap
    const page1Ids = new Set(page1.data.map((e) => e.id));
    for (const e of page2.data) {
      expect(page1Ids.has(e.id as string)).toBe(false);
    }
  });

  it("cursor with a changed sort → validation_error (400)", async () => {
    const c = client();
    // Get a cursor with sort=updatedAt
    const page1 = (await (c as Record<string, CallableFunction>)
      .notesPageList({
        limit: 2,
        sort: "updatedAt",
      })) as { nextCursor: string | null };
    expect(page1.nextCursor).not.toBeNull();

    // Use it with sort=title → should fail
    try {
      await (c as Record<string, CallableFunction>).notesPageList({
        limit: 2,
        sort: "title",
        cursor: page1.nextCursor!,
      });
      expect.unreachable("should have thrown validation_error");
    } catch (err) {
      expect((err as ORPCError<string, unknown>).code).toBe(
        "validation_error",
      );
      const data = (err as ORPCError<string, unknown>).data as Record<
        string,
        unknown
      >;
      expect(
        (data.details as Array<{ path: string }>)[0]?.path,
      ).toBe("cursor");
    }
  });

  it("null nextCursor when fewer than limit", async () => {
    const c = client();
    const result = (await (c as Record<string, CallableFunction>)
      .notesPageList({ limit: 100 })) as {
      data: unknown[];
      nextCursor: string | null;
    };
    expect(result.nextCursor).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Stale version conflict (409)
// ---------------------------------------------------------------------------

describe("expectedVersion conflict", () => {
  let entityId: string;

  beforeAll(async () => {
    const c = client();
    const result = (await (c as Record<string, CallableFunction>)
      .notesPageCreate({
        title: `Version Test ${PREFIX}`,
      })) as Record<string, unknown>;
    entityId = result.id as string;
  });

  it("stale expectedVersion → conflict (409)", async () => {
    const c = client();

    // First update succeeds
    await (c as Record<string, CallableFunction>).notesPageUpdate({
      id: entityId,
      expectedVersion: 1,
      data: { title: "V2" },
    });

    // Second update with old version fails
    try {
      await (c as Record<string, CallableFunction>).notesPageUpdate({
        id: entityId,
        expectedVersion: 1, // stale!
        data: { title: "V3" },
      });
      expect.unreachable("should have thrown conflict");
    } catch (err) {
      const e = err as ORPCError<string, unknown>;
      expect(e.code).toBe("conflict");
      const data = e.data as Record<string, unknown>;
      expect(data.currentVersion).toBe(2);
    }

    // Entity still has the V2 title (unchanged)
    const entity = (await (c as Record<string, CallableFunction>)
      .notesPageGet({ id: entityId })) as Record<string, unknown>;
    expect(entity.title).toBe("V2");
  });

  it("update without expectedVersion → applied (last-write-wins)", async () => {
    const c = client();

    const before = (await (c as Record<string, CallableFunction>)
      .notesPageGet({ id: entityId })) as Record<string, unknown>;
    const beforeVersion = before.version as number;

    const result = (await (c as Record<string, CallableFunction>)
      .notesPageUpdate({
        id: entityId,
        data: { title: "No Version Check" },
      })) as Record<string, unknown>;
    expect(result.title).toBe("No Version Check");
    expect(result.version).toBe(beforeVersion + 1);
  });
});

// ---------------------------------------------------------------------------
// 5. Disabled feature → 403
// ---------------------------------------------------------------------------

describe("disabled feature → forbidden", () => {
  it("checkFeatureEnabled throws forbidden for disabled feature", async () => {
    // Create a fake module with attachments disabled
    const z = await import("zod");
    const fakeDef: ModuleDefinition = {
      type: "no-attach",
      label: { singular: "No Attach", plural: "No Attaches" },
      icon: "x",
      fields: z.object({
        title: z.string().min(1).max(200).meta({ label: "Title" }),
      }),
      listColumns: [],
      filters: [],
      sorts: {},
      placeRule: "hidden",
      features: {
        notes: true,
        attachments: false, // disabled
      },
      quickCreate: [],
    };

    const registry: Record<string, AnyModuleRecord> = {
      "no-attach": {
        definition: fakeDef,
        server: {
          type: "no-attach",
          detailsTable: {},
          searchText: () => "",
          summary: () => ({}),
        } as AnyModuleServer,
        ui: null,
      },
    };

    // Enabled feature should not throw
    expect(() =>
      checkFeatureEnabled(registry, "no-attach", "notes"),
    ).not.toThrow();

    // Disabled feature should throw forbidden
    try {
      checkFeatureEnabled(registry, "no-attach", "attachments");
      expect.unreachable("should have thrown forbidden");
    } catch (err) {
      const e = err as ORPCError<string, unknown>;
      expect(e.code).toBe("forbidden");
      expect(e.status).toBe(403);
    }

    // Non-specified feature (reminders) should throw forbidden
    try {
      checkFeatureEnabled(registry, "no-attach", "reminders");
      expect.unreachable("should have thrown forbidden");
    } catch (err) {
      const e = err as ORPCError<string, unknown>;
      expect(e.code).toBe("forbidden");
    }
  });

  it("notes-page has all features enabled", () => {
    const registry: Record<string, AnyModuleRecord> = {
      "notes-page": notesPageRecord(),
    };

    // All these should not throw
    for (const feature of [
      "notes",
      "comments",
      "attachments",
      "reminders",
      "assignees",
      "links",
      "tags",
    ]) {
      expect(() =>
        checkFeatureEnabled(registry, "notes-page", feature),
      ).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// 6. CRUD through REST handler
// ---------------------------------------------------------------------------

describe("notes-page CRUD through REST", () => {
  let apiKey: string;
  let entityId: string;
  const REST_USER_ID = `u-rest-${PREFIX}`;

  beforeAll(async () => {
    seedUserGlobal(REST_USER_ID, `resttest-${PREFIX}`);
    const keyResult = await auth.api.createApiKey({
      body: { userId: REST_USER_ID, name: `rest-${PREFIX}` },
    });
    apiKey = (keyResult as Record<string, unknown>).key as string;
  });

  function apiRequest(
    path: string,
    options: {
      method?: string;
      bearer?: string;
      body?: unknown;
    } = {},
  ): Request {
    const method = options.method ?? "GET";
    const url = `http://localhost/api/v1${path}`;
    const headers: Record<string, string> = {};
    if (options.bearer) {
      headers["Authorization"] = `Bearer ${options.bearer}`;
    }
    let body: string | undefined;
    if (options.body !== undefined) {
      body = JSON.stringify(options.body);
      headers["Content-Type"] = "application/json";
    }
    return new Request(url, { method, headers, body });
  }

  it("POST /notes-page creates an entity", async () => {
    const req = apiRequest("/notes-page", {
      method: "POST",
      bearer: apiKey,
      body: {
        title: `REST Create ${PREFIX}`,
        category: "contacts",
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.title).toBe(`REST Create ${PREFIX}`);
    expect(body.category).toBe("contacts");
    expect(body.type).toBe("notes-page");
    entityId = body.id as string;
  });

  it("GET /notes-page lists entities", async () => {
    const req = apiRequest("/notes-page", {
      bearer: apiKey,
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<Record<string, unknown>>;
      nextCursor: string | null;
    };
    expect(Array.isArray(body.data)).toBe(true);
    const found = body.data.find((e) => e.id === entityId);
    expect(found).toBeDefined();
  });

  it("GET /notes-page/{id} gets an entity", async () => {
    const req = apiRequest(`/notes-page/${entityId}`, {
      bearer: apiKey,
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.id).toBe(entityId);
  });

  it("PATCH /notes-page/{id} updates an entity", async () => {
    const { PATCH } = await import("../../app/api/v1/[[...rest]]/route");
    const req = apiRequest(`/notes-page/${entityId}`, {
      method: "PATCH",
      bearer: apiKey,
      body: {
        id: entityId,
        data: { title: `REST Updated ${PREFIX}` },
      },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.title).toBe(`REST Updated ${PREFIX}`);
  });

  it("POST /notes-page/{id}/archive archives", async () => {
    const req = apiRequest(`/notes-page/${entityId}/archive`, {
      method: "POST",
      bearer: apiKey,
      body: { id: entityId },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("POST /notes-page/{id}/unarchive unarchives", async () => {
    const req = apiRequest(`/notes-page/${entityId}/unarchive`, {
      method: "POST",
      bearer: apiKey,
      body: { id: entityId },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("POST /notes-page/{id}/delete soft-deletes", async () => {
    const req = apiRequest(`/notes-page/${entityId}/delete`, {
      method: "POST",
      bearer: apiKey,
      body: { id: entityId },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("POST /notes-page/{id}/restore restores", async () => {
    const req = apiRequest(`/notes-page/${entityId}/restore`, {
      method: "POST",
      bearer: apiKey,
      body: { id: entityId },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    // Verify restored
    const getReq = apiRequest(`/notes-page/${entityId}`, {
      bearer: apiKey,
    });
    const getRes = await GET(getReq);
    expect(getRes.status).toBe(200);
  });

  it("validation error through REST (title too long)", async () => {
    const req = apiRequest("/notes-page", {
      method: "POST",
      bearer: apiKey,
      body: { title: "x".repeat(201) },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: { code: string; details: unknown[] };
    };
    expect(body.error.code).toBe("validation_error");
  });

  it("stale version through REST → 409", async () => {
    // Get current version
    const getReq = apiRequest(`/notes-page/${entityId}`, {
      bearer: apiKey,
    });
    const getRes = await GET(getReq);
    const entity = (await getRes.json()) as Record<string, unknown>;
    const currentVersion = entity.version as number;

    // Update to bump version
    const { PATCH } = await import("../../app/api/v1/[[...rest]]/route");
    const updateReq = apiRequest(`/notes-page/${entityId}`, {
      method: "PATCH",
      bearer: apiKey,
      body: {
        id: entityId,
        data: { title: "Bumped" },
      },
    });
    await PATCH(updateReq);

    // Now try with stale version
    const staleReq = apiRequest(`/notes-page/${entityId}`, {
      method: "PATCH",
      bearer: apiKey,
      body: {
        id: entityId,
        expectedVersion: currentVersion, // stale
        data: { title: "Stale" },
      },
    });
    const staleRes = await PATCH(staleReq);
    expect(staleRes.status).toBe(409);
    const staleBody = (await staleRes.json()) as {
      error: { code: string };
    };
    expect(staleBody.error.code).toBe("conflict");
  });
});

// ---------------------------------------------------------------------------
// 7. List with filter
// ---------------------------------------------------------------------------

describe("list with filter", () => {
  beforeAll(async () => {
    const c = client();
    await (c as Record<string, CallableFunction>).notesPageCreate({
      title: `Filter Test A ${PREFIX}`,
      category: "other",
    });
    await (c as Record<string, CallableFunction>).notesPageCreate({
      title: `Filter Test B ${PREFIX}`,
      category: "contacts",
    });
  });

  it("filters by category", async () => {
    const c = client();
    const result = (await (c as Record<string, CallableFunction>)
      .notesPageList({
        filters: { category: "other" },
      })) as {
      data: Array<Record<string, unknown>>;
    };
    for (const entity of result.data) {
      expect(entity.category).toBe("other");
    }
  });

  it("invalid filter key → validation_error", async () => {
    const c = client();
    try {
      await (c as Record<string, CallableFunction>).notesPageList({
        filters: { nonexistent: "value" },
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as ORPCError<string, unknown>).code).toBe(
        "validation_error",
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 8. get non-existent → 404
// ---------------------------------------------------------------------------

describe("get non-existent entity", () => {
  it("returns not_found", async () => {
    const c = client();
    try {
      await (c as Record<string, CallableFunction>).notesPageGet({
        id: "nonexistent-id",
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as ORPCError<string, unknown>).code).toBe("not_found");
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Optional fields work correctly
// ---------------------------------------------------------------------------

describe("optional fields", () => {
  it("creates entity without optional fields", async () => {
    const c = client();
    const result = (await (c as Record<string, CallableFunction>)
      .notesPageCreate({
        title: `Optional Only ${PREFIX}`,
      })) as Record<string, unknown>;
    expect(result.category).toBeNull();
    expect(result.reviewOn).toBeNull();
  });
});
