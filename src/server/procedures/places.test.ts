/**
 * Places procedures tests (tasks 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, design D7).
 *
 * Uses the global in-memory DB (consistent with module.test.ts) and exercises
 * the places procedures, the module create/update place handling, the scope
 * filter, and the rollup/purge logic through the router client.
 */

import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "file::memory:?cache=shared";
});

import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createRouterClient } from "@orpc/server";

import { db, sqlite } from "../../db";
import { MIGRATIONS_FOLDER } from "../../db/testing";
import { router } from "../router";
import { validationInterceptor } from "../orpc";
import type { AppContext } from "../context";
import { validatePlaceId } from "./module";
import { purgeTrash } from "../trash";
import type { ORPCError } from "@orpc/server";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(() => {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  seedUser();
});

afterAll(() => {
  delete process.env.UPLOADS_DIR;
});

const USER_ID = "u-places-" + randomUUID().slice(0, 8);

function seedUser(): void {
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO user
       (id, name, email, email_verified, created_at, updated_at, username, role)
       VALUES (?, ?, ?, 0, unixepoch()*1000, unixepoch()*1000, ?, 'user')`,
    )
    .run(USER_ID, "Places Tester", `${USER_ID}@users.hearth.invalid`, USER_ID.slice(0, 20));
}

function makeCtx(): AppContext {
  return {
    user: {
      id: USER_ID,
      name: USER_ID,
      email: `${USER_ID}@users.hearth.invalid`,
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

function client() {
  return createRouterClient(router, {
    context: makeCtx(),
    interceptors: [validationInterceptor],
  });
}

// ---------------------------------------------------------------------------
// Helpers to create places/notes through the procedures
// ---------------------------------------------------------------------------

async function createPlace(
  title: string,
  kind: "property" | "structure" | "room" | "area",
  parentId?: string,
): Promise<string> {
  const c = client();
  const result = (await (c as Record<string, CallableFunction>).placesCreate({
    title,
    kind,
    parentId: parentId ?? null,
  })) as { id: string };
  return result.id;
}

async function createNote(title: string, placeId?: string): Promise<string> {
  const c = client();
  const result = (await (c as Record<string, CallableFunction>).notesPageCreate({
    title,
    placeId: placeId ?? null,
  })) as { id: string };
  return result.id;
}

// ---------------------------------------------------------------------------
// 7.1 — places extension + kind/parent rules
// ---------------------------------------------------------------------------

describe("7.1 place hierarchy rules", () => {
  let mainHouse: string;

  it("creates a top-level property", async () => {
    mainHouse = await createPlace("Main House", "property");
    expect(mainHouse).toBeTruthy();
  });

  it("creates a room under a property", async () => {
    const kitchen = await createPlace("Kitchen", "room", mainHouse);
    expect(kitchen).toBeTruthy();
  });

  it("rejects a room without a parent (validation_error)", async () => {
    const c = client();
    try {
      await (c as Record<string, CallableFunction>).placesCreate({
        title: "Orphan Room",
        kind: "room",
        parentId: null,
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as ORPCError<string, unknown>).code).toBe("validation_error");
    }
  });

  it("rejects a property with a parent (validation_error)", async () => {
    const c = client();
    try {
      await (c as Record<string, CallableFunction>).placesCreate({
        title: "Nested Property",
        kind: "property",
        parentId: mainHouse,
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as ORPCError<string, unknown>).code).toBe("validation_error");
    }
  });
});

// ---------------------------------------------------------------------------
// 7.2 — move with path rewrite and cycle check
// ---------------------------------------------------------------------------

describe("7.2 places.move", () => {
  let mainHouse: string;
  let cabin: string;
  let kitchen: string;
  let pantry: string;
  let garage: string;

  beforeAll(async () => {
    mainHouse = await createPlace("Main House", "property");
    cabin = await createPlace("Cabin", "property");
    kitchen = await createPlace("Kitchen", "room", mainHouse);
    garage = await createPlace("Garage", "room", mainHouse);
    pantry = await createPlace("Pantry", "room", kitchen);
  });

  it("rewrites descendant paths when moving a place", async () => {
    // Place a note in Pantry, then move Pantry under Garage.
    const noteId = await createNote("Canned goods", pantry);

    const c = client();
    await (c as Record<string, CallableFunction>).placesMove({
      id: pantry,
      parentId: garage,
    });

    // Pantry's path is now under Garage's subtree.
    const pantryRow = sqlite
      .prepare("SELECT path FROM places WHERE entity_id = ?")
      .get(pantry) as { path: string };
    const garagePath = (sqlite
      .prepare("SELECT path FROM places WHERE entity_id = ?")
      .get(garage) as { path: string }).path;
    expect(pantryRow.path.startsWith(garagePath)).toBe(true);

    // The note in Pantry now rolls up under Garage's subtree.
    const rollup = (await (c as Record<string, CallableFunction>).placesRollup({
      id: garage,
    })) as { groups: Array<{ type: string; count: number }> };
    const notesGroup = rollup.groups.find((g) => g.type === "notes-page");
    expect(notesGroup).toBeDefined();
    expect(notesGroup!.count).toBeGreaterThanOrEqual(1);
  });

  it("rejects moving a place under one of its own descendants", async () => {
    // After the move above, Pantry is a descendant of Garage. Moving Garage
    // (or any ancestor) under Pantry must be rejected as a cycle.
    const c = client();
    try {
      await (c as Record<string, CallableFunction>).placesMove({
        id: garage,
        parentId: pantry,
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as ORPCError<string, unknown>).code).toBe("conflict");
    }
  });
});

// ---------------------------------------------------------------------------
// 7.3 — place field driven by placeRule; place_id references a place
// ---------------------------------------------------------------------------

describe("7.3 place field handling on module create", () => {
  let mainHouse: string;

  beforeAll(async () => {
    mainHouse = await createPlace("Main House (7.3)", "property");
  });

  it("notes-page (optional) accepts a valid place_id", async () => {
    const noteId = await createNote("placed note", mainHouse);
    const c = client();
    const entity = (await (c as Record<string, CallableFunction>).notesPageGet({
      id: noteId,
    })) as { placeId: string | null };
    expect(entity.placeId).toBe(mainHouse);
  });

  it("rejects a place_id that does not reference a place (validation_error)", async () => {
    // Create a normal note (not a place), then try to place another note in it.
    const nonPlaceId = await createNote("a regular note");
    const c = client();
    try {
      await (c as Record<string, CallableFunction>).notesPageCreate({
        title: "badly placed",
        placeId: nonPlaceId,
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as ORPCError<string, unknown>).code).toBe("validation_error");
    }
  });

  it("validatePlaceId enforces the rules directly", () => {
    const conn = sqlite;
    // required rule with no place → validation_error
    expect(() => validatePlaceId(conn, null, "required", true)).toThrow();
    // required rule with a place → no throw
    expect(() => validatePlaceId(conn, mainHouse, "required", true)).not.toThrow();
    // hidden rule ignores any value (no throw)
    expect(() => validatePlaceId(conn, nonPlaceIdUnused(), "hidden", true)).not.toThrow();
    // optional with a non-place reference → throw
    expect(() => validatePlaceId(conn, "not-a-place", "optional", false)).toThrow();
  });
});

function nonPlaceIdUnused(): string {
  return "some-random-non-place-id";
}

// ---------------------------------------------------------------------------
// 7.4 — property scope preference + single scope filter on lists
// ---------------------------------------------------------------------------

describe("7.4 property scope filter", () => {
  let mainHouse: string;
  let cabin: string;
  let kitchen: string;

  async function setScope(scope: string | null): Promise<void> {
    const c = client();
    await (c as Record<string, CallableFunction>).updatePreferences({
      propertyScope: scope,
    });
  }

  beforeAll(async () => {
    mainHouse = await createPlace("Scope House", "property");
    cabin = await createPlace("Scope Cabin", "property");
    kitchen = await createPlace("Scope Kitchen", "room", mainHouse);
  });

  it("when scoped to a property, lists include its subtree and unplaced, exclude others", async () => {
    const inScope = await createNote("in scope", kitchen);
    const unplaced = await createNote("unplaced");
    const outOfScope = await createNote("out of scope", cabin);

    await setScope(mainHouse);

    const c = client();
    const result = (await (c as Record<string, CallableFunction>).notesPageList({
      limit: 100,
      sort: "title",
      sortDirection: "asc",
    })) as { data: Array<{ id: string; title: string }> };

    const ids = result.data.map((d) => d.id);
    expect(ids).toContain(inScope);
    expect(ids).toContain(unplaced);
    expect(ids).not.toContain(outOfScope);

    // Switching back to "All" (null) shows everything.
    await setScope(null);
    const all = (await (c as Record<string, CallableFunction>).notesPageList({
      limit: 100,
    })) as { data: Array<{ id: string }> };
    expect(all.data.map((d) => d.id)).toContain(outOfScope);
  });
});

// ---------------------------------------------------------------------------
// 7.5 — rollup counts grouped by module
// ---------------------------------------------------------------------------

describe("7.5 rollup counts", () => {
  let mainHouse: string;
  let kitchen: string;

  beforeAll(async () => {
    mainHouse = await createPlace("Rollup House", "property");
    kitchen = await createPlace("Rollup Kitchen", "room", mainHouse);
    await createNote("rollup note in kitchen", kitchen);
    await createNote("rollup note in house", mainHouse);
  });

  it("subtree rollup groups by module and counts descendants", async () => {
    const c = client();
    const result = (await (c as Record<string, CallableFunction>).placesRollup({
      id: mainHouse,
      exact: false,
    })) as { groups: Array<{ type: string; count: number }>; total: number; children: unknown[] };
    const notesGroup = result.groups.find((g) => g.type === "notes-page");
    expect(notesGroup).toBeDefined();
    expect(notesGroup!.count).toBe(2);
    expect(result.total).toBe(2);
  });

  it("exact ('this level only') shows only entities placed directly on the place", async () => {
    const c = client();
    const result = (await (c as Record<string, CallableFunction>).placesRollup({
      id: mainHouse,
      exact: true,
    })) as { groups: Array<{ type: string; count: number }>; total: number };
    const notesGroup = result.groups.find((g) => g.type === "notes-page");
    expect(notesGroup).toBeDefined();
    expect(notesGroup!.count).toBe(1);
    expect(result.total).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 7.6 — place deletion/restore/purge
// ---------------------------------------------------------------------------

describe("7.6 place delete + restore + purge", () => {
  let garage: string;
  let workbench: string;
  let noteId: string;

  beforeAll(async () => {
    const house = await createPlace("Garage House", "property");
    garage = await createPlace("Garage", "room", house);
    workbench = await createPlace("Workbench", "area", garage);
    noteId = await createNote("tool", garage);
  });

  it("deleting a place trashes the subtree as one batch, keeping placed entities", async () => {
    const c = client();
    const result = (await (c as Record<string, CallableFunction>).placesDelete({
      id: garage,
    })) as { ok: boolean; trashed: number };
    expect(result.ok).toBe(true);
    expect(result.trashed).toBeGreaterThanOrEqual(2); // garage + workbench

    const garageRow = sqlite
      .prepare("SELECT deleted_at, trash_batch_id FROM entities WHERE id = ?")
      .get(garage) as { deleted_at: number | null; trash_batch_id: string | null };
    const workbenchRow = sqlite
      .prepare("SELECT deleted_at, trash_batch_id FROM entities WHERE id = ?")
      .get(workbench) as { deleted_at: number | null; trash_batch_id: string | null };
    expect(garageRow.deleted_at).not.toBeNull();
    expect(workbenchRow.deleted_at).not.toBeNull();
    expect(garageRow.trash_batch_id).toBe(workbenchRow.trash_batch_id);

    // The placed note survives (still present, un-deleted).
    const noteRow = sqlite
      .prepare("SELECT deleted_at FROM entities WHERE id = ?")
      .get(noteId) as { deleted_at: number | null };
    expect(noteRow.deleted_at).toBeNull();
  });

  it("restores the whole batch", async () => {
    const c = client();
    const garageRow = sqlite
      .prepare("SELECT trash_batch_id FROM entities WHERE id = ?")
      .get(garage) as { trash_batch_id: string };
    const result = (await (c as Record<string, CallableFunction>).placesRestore({
      id: garage,
    })) as { restored: number };
    expect(result.restored).toBeGreaterThanOrEqual(2);

    const g = sqlite
      .prepare("SELECT deleted_at FROM entities WHERE id = ?")
      .get(garage) as { deleted_at: number | null };
    const w = sqlite
      .prepare("SELECT deleted_at FROM entities WHERE id = ?")
      .get(workbench) as { deleted_at: number | null };
    expect(g.deleted_at).toBeNull();
    expect(w.deleted_at).toBeNull();
  });

  it("refuses to restore a child of a still-trashed parent (conflict)", async () => {
    const house = await createPlace("Blocked House", "property");
    const parentRoom = await createPlace("Parent Room", "room", house);
    const childArea = await createPlace("Child Area", "area", parentRoom);

    const c = client();
    // Trash the child alone first.
    await (c as Record<string, CallableFunction>).placesDelete({ id: childArea });
    // Then trash the parent (child already trashed → not included, stays its own batch).
    await (c as Record<string, CallableFunction>).placesDelete({ id: parentRoom });

    try {
      await (c as Record<string, CallableFunction>).placesRestore({ id: childArea });
      expect.unreachable("should have thrown conflict");
    } catch (err) {
      expect((err as ORPCError<string, unknown>).code).toBe("conflict");
    }

    // Restoring the parent first then the child works.
    await (c as Record<string, CallableFunction>).placesRestore({ id: parentRoom });
    const r = (await (c as Record<string, CallableFunction>).placesRestore({
      id: childArea,
    })) as { restored: number };
    expect(r.restored).toBe(1);
  });

  it("purge unplaces entities via ON DELETE SET NULL", async () => {
    const now = new Date("2025-03-15T12:00:00Z");
    const uploadsDir = mkdtempSync(join(tmpdir(), "hearth-uploads-"));
    process.env.UPLOADS_DIR = uploadsDir;

    const house = await createPlace("Purge House", "property");
    const room = await createPlace("Purge Room", "room", house);
    const purgeNoteId = await createNote("purge me", room);

    const c = client();
    await (c as Record<string, CallableFunction>).placesDelete({ id: room });

    // Age the trashed place beyond the purge cutoff.
    const old = now.getTime() - 40 * 24 * 60 * 60 * 1000;
    sqlite.prepare("UPDATE entities SET deleted_at = ? WHERE id = ?").run(old, room);
    sqlite.prepare("UPDATE entities SET deleted_at = ? WHERE id = ?").run(old, house);

    await purgeTrash(sqlite, now, uploadsDir);

    // The room is gone; the placed note is now unplaced.
    expect(sqlite.prepare("SELECT id FROM entities WHERE id = ?").get(room)).toBeUndefined();
    const note = sqlite
      .prepare("SELECT place_id FROM entities WHERE id = ?")
      .get(purgeNoteId) as { place_id: string | null };
    expect(note.place_id).toBeNull();
  });
});
