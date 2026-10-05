/**
 * Tests for the search procedure and search consistency check
 * (task 12.2, design D10).
 *
 *  - a created entity is found immediately,
 *  - a prefix query ("alab") finds "Alabaster",
 *  - title vs. body (notes) matching with snippets,
 *  - `type:`, `place:` (subtree), `tag:` and `@member` filters,
 *  - archived/trashed entities are excluded,
 *  - property scope is respected,
 *  - `checkSearchConsistency` restores deleted index rows.
 */

import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "file::memory:?cache=shared";
});

import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createRouterClient } from "@orpc/server";

import { db, sqlite } from "../../db";
import { MIGRATIONS_FOLDER } from "../../db/testing";
import { router } from "../router";
import { validationInterceptor } from "../orpc";
import type { AppContext } from "../context";
import { checkSearchConsistency, rebuildAllIndex } from "../../db/search";
import type { ORPCError } from "@orpc/server";

const PREFIX = randomUUID().slice(0, 8);
const CJ = `u-cj-${PREFIX}`;
const SAM = `u-sam-${PREFIX}`;

beforeAll(() => {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  insertUser(CJ, "CJ", "cj", "admin");
  insertUser(SAM, "Sam", "sam", "user");
});

beforeEach(() => {
  // Keep tests independent.
  sqlite.prepare("DELETE FROM user_preferences WHERE user_id = ?").run(CJ);
});

function insertUser(id: string, name: string, username: string, role: string) {
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO user
       (id, name, email, email_verified, created_at, updated_at, username, role, banned)
       VALUES (?, ?, ?, 0, unixepoch()*1000, unixepoch()*1000, ?, ?, 0)`,
    )
    .run(id, name, `${username}-${PREFIX}@users.hearth.invalid`, username, role);
}

function ctx(userId = CJ): AppContext {
  return {
    user: {
      id: userId,
      name: userId === CJ ? "CJ" : "Sam",
      email: `${userId}@users.hearth.invalid`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      role: userId === CJ ? "admin" : "user",
    } as AppContext["user"],
    via: "web",
    now: Date.now(),
    requestId: randomUUID(),
  };
}

function client(userId = CJ) {
  return createRouterClient(router, {
    context: ctx(userId),
    interceptors: [validationInterceptor],
  });
}

type Client = ReturnType<typeof client>;

async function proc(c: Client, key: string, input: Record<string, unknown>) {
  return (c as unknown as Record<string, CallableFunction>)[key](input);
}

/** Count rows in the index and the entities search_index row for an id. */
function indexRow(entityId: string) {
  return sqlite
    .prepare("SELECT * FROM search_index WHERE entity_id = ?")
    .get(entityId) as { title: string; body: string } | undefined;
}

async function createPlace(
  title: string,
  kind: "property" | "structure" | "room" | "area",
  parentId?: string,
): Promise<string> {
  const c = client();
  const r = (await proc(c, "placesCreate", {
    title,
    kind,
    parentId: parentId ?? null,
  })) as { id: string };
  return r.id;
}

async function createNote(title: string, placeId?: string): Promise<string> {
  const c = client();
  const r = (await proc(c, "notesPageCreate", {
    title,
    placeId: placeId ?? null,
  })) as { id: string };
  return r.id;
}

async function search(q: string, limit = 20): Promise<Array<{ id: string; title: string; snippet: string | null; type: string }>> {
  const c = client();
  const r = (await proc(c, "search", { q, limit })) as {
    data: Array<{ id: string; title: string; snippet: string | null; type: string }>;
  };
  return r.data;
}

// ---------------------------------------------------------------------------
// Index freshness
// ---------------------------------------------------------------------------

describe("12.2 index freshness", () => {
  it("returns a created entity immediately", async () => {
    const id = await createNote("Alabaster");
    const results = await search("alabaster");
    expect(results.map((r) => r.id)).toContain(id);
  });

  it("prefix-matches while typing: 'alab' finds 'Alabaster'", async () => {
    const id = await createNote("Alabaster");
    const results = await search("alab");
    expect(results.map((r) => r.id)).toContain(id);
  });

  it("matches text in notes and returns a highlighted snippet", async () => {
    const id = await createNote("Inventory item");
    await proc(client(), "saveNotes", {
      id,
      markdown: "This container holds Alabaster powder.",
    });
    const results = await search("alabaster");
    const hit = results.find((r) => r.id === id);
    expect(hit).toBeDefined();
    expect(hit!.snippet).toContain("<mark>");
  });

  it("indexes comment markdown", async () => {
    const id = await createNote("Receipt");
    await proc(client(), "createComment", {
      id,
      markdown: "The washer repair cost is documented here.",
    });
    const results = await search("washer");
    expect(results.map((r) => r.id)).toContain(id);
  });
});

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

describe("12.2 search filters", () => {
  it("type: restricts to a module type", async () => {
    const id = await createNote("Filtered note");
    const results = await search("type:notes-page Filtered");
    expect(results.map((r) => r.id)).toContain(id);
  });

  it("place: limits to a place subtree (all matching-named places)", async () => {
    const house = await createPlace("Main House", "property");
    const cabin = await createPlace("Cabin", "property");
    const kitchenMain = await createPlace("Kitchen", "room", house);
    const kitchenCabin = await createPlace("Kitchen", "room", cabin);
    const pantry = await createPlace("Pantry", "room", kitchenMain);
    const idHouse = await createNote("kitchen paint", pantry);
    const idCabin = await createNote("kitchen paint cabin", kitchenCabin);

    const results = await search("place:kitchen paint");
    const ids = results.map((r) => r.id);
    // Both kitchens (and their subtrees) are included for the shared name.
    expect(ids).toContain(idHouse);
    expect(ids).toContain(idCabin);
  });

  it("tag: filters to entities carrying the tag", async () => {
    const id = await createNote("Tagged note");
    await proc(client(), "tagsAdd", { id, name: "kitchen" });
    const results = await search("tag:kitchen Tagged");
    expect(results.map((r) => r.id)).toContain(id);
  });

  it("@member filters to entities assigned to a member", async () => {
    const id = await createNote("Assigned to Sam");
    await proc(client(), "addAssignee", { id, userId: SAM });
    const results = await search("@sam Assigned");
    expect(results.map((r) => r.id)).toContain(id);
  });
});

// ---------------------------------------------------------------------------
// Visibility, scope, deletion
// ---------------------------------------------------------------------------

describe("12.2 visibility and scope", () => {
  it("excludes archived and trashed entities", async () => {
    const archived = await createNote("archived thing");
    const trashed = await createNote("trashed thing");
    await proc(client(), "notesPageArchive", { id: archived });
    await proc(client(), "notesPageDelete", { id: trashed });

    const results = await search("thing");
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain(archived);
    expect(ids).not.toContain(trashed);
  });

  it("respects the property scope", async () => {
    const house = await createPlace("Scope House", "property");
    const other = await createPlace("Other House", "property");
    const room = await createPlace("Scope Room", "room", house);
    const inScope = await createNote("scope me", room);
    const outScope = await createNote("scope me out", other);

    // Default scope (All) finds both.
    let results = await search("scope me");
    expect(results.map((r) => r.id)).toContain(inScope);
    expect(results.map((r) => r.id)).toContain(outScope);

    // Scope to the property → out-of-scope entity disappears.
    sqlite
      .prepare(
        `INSERT INTO user_preferences (user_id, property_scope) VALUES (?, ?)
         ON CONFLICT (user_id) DO UPDATE SET property_scope = excluded.property_scope`,
      )
      .run(CJ, house);
    results = await search("scope me");
    const ids = results.map((r) => r.id);
    expect(ids).toContain(inScope);
    expect(ids).not.toContain(outScope);
  });
});

// ---------------------------------------------------------------------------
// Consistency check
// ---------------------------------------------------------------------------

describe("12.2 search consistency check", () => {
  it("restores deleted index rows", async () => {
    const id = await createNote("Consistency");
    // Delete the index row as if it drifted.
    sqlite.prepare("DELETE FROM search_index WHERE entity_id = ?").run(id);
    expect(indexRow(id)).toBeUndefined();

    const repaired = checkSearchConsistency(sqlite);
    expect(repaired).toBeGreaterThanOrEqual(1);
    expect(indexRow(id)).toBeDefined();
  });

  it("rebuilds the whole index", async () => {
    const id = await createNote("rebuild me");
    const before = indexRow(id);
    expect(before).toBeDefined();

    // Wipe a row to simulate corruption, then rebuild all.
    sqlite.prepare("DELETE FROM search_index WHERE entity_id = ?").run(id);
    expect(indexRow(id)).toBeUndefined();

    const count = rebuildAllIndex(sqlite);
    expect(count).toBeGreaterThan(0);
    expect(indexRow(id)).toBeDefined();
    // Rebuilt rows are immediately searchable.
    const results = await search("rebuild");
    expect(results.map((r) => r.id)).toContain(id);
  });

  it("removes orphan index rows for purged entities", async () => {
    const id = randomUUID();
    sqlite.prepare("DELETE FROM search_index WHERE entity_id = ?").run(id);
    // Insert an index row whose entity does not exist.
    sqlite
      .prepare(
        "INSERT INTO search_index (entity_id, type, title, body) VALUES (?, 'notes-page', 'orphan', 'orphan')",
      )
      .run(id);
    const repaired = checkSearchConsistency(sqlite);
    expect(repaired).toBeGreaterThanOrEqual(1);
    expect(indexRow(id)).toBeUndefined();
  });
});
