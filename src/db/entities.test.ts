/**
 * Tests for the entities core data model migration (task 3.1).
 *
 * Uses the `createTestDatabase()` helper which opens an in-memory SQLite DB
 * and applies every migration — the same path used by procedure tests (D21).
 */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "./testing";
import { entities } from "./schema/entities";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal user row for FK references. */
function seedUser(db: TestDatabase, id: string, username: string) {
  db.connection.prepare(
    `INSERT INTO user
     (id, name, email, email_verified, created_at, updated_at, username, role)
     VALUES (?, ?, ?, 0, unixepoch()*1000, unixepoch()*1000, ?, 'user')`,
  ).run(id, username, `${username}@users.hearth.invalid`, username);
}

function seedEntity(
  db: TestDatabase,
  id: string,
  userId: string,
  opts: { type?: string; title?: string; placeId?: string | null } = {},
) {
  db.connection
    .prepare(
      `INSERT INTO entities
       (id, type, title, place_id, version, created_by, updated_by)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      id,
      opts.type ?? "test-type",
      opts.title ?? "Test Entity",
      opts.placeId ?? null,
      userId,
      userId,
    );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let db: TestDatabase;

beforeEach(() => {
  db = createTestDatabase();
});

// ---------------------------------------------------------------------------
// 1. Migration correctness — tables exist in sqlite_master
// ---------------------------------------------------------------------------

describe("migration applies correctly", () => {
  it("creates the relational tables", () => {
    const names = db.connection
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table'
         AND name IN ('entities','activity','attention','idempotency_keys','job_runs')
         ORDER BY name`,
      )
      .pluck()
      .all() as string[];

    expect(names).toEqual(
      ["activity", "attention", "entities", "idempotency_keys", "job_runs"].sort(),
    );
  });

  it("creates the FTS5 search_index virtual table", () => {
    const row = db.connection
      .prepare(
        `SELECT name FROM sqlite_master WHERE name = 'search_index'`,
      )
      .get() as { name: string } | undefined;

    expect(row?.name).toBe("search_index");
  });

  it("registers correct FTS5 tokenizer in the DDL", () => {
    // The CREATE VIRTUAL TABLE DDL is stored in sqlite_master
    const row = db.connection
      .prepare(
        `SELECT sql FROM sqlite_master WHERE name = 'search_index'`,
      )
      .get() as { sql: string } | undefined;

    expect(row?.sql).toMatch(/unicode61/);
    expect(row?.sql).toMatch(/remove_diacritics 2/);
  });

  it("entities table has expected columns", () => {
    const cols = db.connection
      .prepare("PRAGMA table_info(entities)")
      .all() as Array<{ name: string }>;
    const colNames = cols.map((c) => c.name);

    expect(colNames).toEqual(
      expect.arrayContaining([
        "id",
        "type",
        "title",
        "place_id",
        "version",
        "created_by",
        "created_via",
        "updated_by",
        "updated_via",
        "created_at",
        "updated_at",
        "archived_at",
        "deleted_at",
        "trash_batch_id",
      ]),
    );
  });

  it("activity table has expected columns", () => {
    const cols = db.connection
      .prepare("PRAGMA table_info(activity)")
      .all() as Array<{ name: string }>;
    const colNames = cols.map((c) => c.name);

    expect(colNames).toEqual(
      expect.arrayContaining([
        "id",
        "entity_id",
        "actor_id",
        "api_key_id",
        "via_label",
        "action",
        "diff",
        "created_at",
        "updated_at",
        "undoes_id",
        "undone_by_id",
      ]),
    );
  });

  it("attention table has expected columns", () => {
    const cols = db.connection
      .prepare("PRAGMA table_info(attention)")
      .all() as Array<{ name: string }>;
    const colNames = cols.map((c) => c.name);

    expect(colNames).toEqual(
      expect.arrayContaining([
        "id",
        "user_id",
        "reason",
        "entity_id",
        "source_type",
        "source_id",
        "occurrence_key",
        "created_at",
        "read_at",
        "dismissed_at",
        "resolved_at",
      ]),
    );
  });

  it("idempotency_keys table has composite PK on (api_key_id, key)", () => {
    const info = db.connection
      .prepare("PRAGMA table_info(idempotency_keys)")
      .all() as Array<{ name: string; pk: number }>;

    const pkCols = info.filter((c) => c.pk > 0).map((c) => c.name);
    expect(pkCols.sort()).toEqual(["api_key_id", "key"]);
  });

  it("job_runs table has name as PK", () => {
    const info = db.connection
      .prepare("PRAGMA table_info(job_runs)")
      .all() as Array<{ name: string; pk: number }>;

    const pk = info.find((c) => c.pk === 1);
    expect(pk?.name).toBe("name");
  });
});

// ---------------------------------------------------------------------------
// 2. FK / place semantics — ON DELETE SET NULL on place_id
// ---------------------------------------------------------------------------

describe("place_id FK ON DELETE SET NULL", () => {
  it("deleting a parent entity nulls place_id on all children", () => {
    const userId = "user-fk-test";
    seedUser(db, userId, "fkuser");

    const parentId = "parent-entity-id";
    const childId = "child-entity-id";

    seedEntity(db, parentId, userId, { type: "place" });
    seedEntity(db, childId, userId, { placeId: parentId });

    // Confirm child has the placeId set
    const before = db.connection
      .prepare("SELECT place_id FROM entities WHERE id = ?")
      .get(childId) as { place_id: string | null };
    expect(before.place_id).toBe(parentId);

    // Hard-delete the parent
    db.connection
      .prepare("DELETE FROM entities WHERE id = ?")
      .run(parentId);

    // Child's place_id must now be NULL (ON DELETE SET NULL)
    const after = db.connection
      .prepare("SELECT place_id FROM entities WHERE id = ?")
      .get(childId) as { place_id: string | null };
    expect(after.place_id).toBeNull();
  });

  it("inserting a child with a non-existent placeId is rejected (FK integrity)", () => {
    const userId = "user-fk-test-2";
    seedUser(db, userId, "fkuser2");

    // Try to insert a child pointing at a non-existent parent
    expect(() => {
      db.connection
        .prepare(
          `INSERT INTO entities
           (id, type, title, place_id, version, created_by, updated_by)
           VALUES ('bad-child', 'test', 'Bad Child', 'does-not-exist', 1, ?, ?)`,
        )
        .run(userId, userId);
    }).toThrow(/FOREIGN KEY/i);
  });
});

// ---------------------------------------------------------------------------
// 3. Timestamps and version defaults
// ---------------------------------------------------------------------------

describe("timestamps and version defaults", () => {
  it("version defaults to 1 when not provided", () => {
    const userId = "user-defaults";
    seedUser(db, userId, "defaultsuser");

    db.connection
      .prepare(
        `INSERT INTO entities (id, type, title, created_by, updated_by)
         VALUES ('ent-defaults', 'test', 'Default Entity', ?, ?)`,
      )
      .run(userId, userId);

    const row = db.connection
      .prepare("SELECT version FROM entities WHERE id = 'ent-defaults'")
      .get() as { version: number };

    expect(row.version).toBe(1);
  });

  it("createdAt is set automatically on insert (DEFAULT nowMs)", () => {
    const userId = "user-ts";
    seedUser(db, userId, "tsuser");

    const before = Date.now();
    db.connection
      .prepare(
        `INSERT INTO entities (id, type, title, created_by, updated_by)
         VALUES ('ent-ts', 'test', 'Timestamp Entity', ?, ?)`,
      )
      .run(userId, userId);
    const after = Date.now();

    const row = db.connection
      .prepare("SELECT created_at FROM entities WHERE id = 'ent-ts'")
      .get() as { created_at: number };

    expect(row.created_at).toBeGreaterThanOrEqual(before - 1000);
    expect(row.created_at).toBeLessThanOrEqual(after + 1000);
  });

  it("Drizzle ORM insert uses version default of 1 and returns populated row", () => {
    const userId = "user-drizzle";
    seedUser(db, userId, "drizzleuser");

    db.client
      .insert(entities)
      .values({
        id: "ent-drizzle",
        type: "test",
        title: "Drizzle Entity",
        createdBy: userId,
        updatedBy: userId,
      })
      .run();

    const row = db.client
      .select()
      .from(entities)
      .where(eq(entities.id, "ent-drizzle"))
      .get();

    expect(row).toBeDefined();
    expect(row!.version).toBe(1);
    expect(row!.createdAt).toBeInstanceOf(Date);
    expect(row!.placeId).toBeNull();
    expect(row!.archivedAt).toBeNull();
    expect(row!.deletedAt).toBeNull();
    expect(row!.trashBatchId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Indexes exist
// ---------------------------------------------------------------------------

describe("indexes exist", () => {
  const expectedIndexes = [
    "entities_type_del_arch_upd_id_idx",
    "entities_place_id_idx",
    "entities_deleted_at_idx",
    "entities_trash_batch_id_idx",
    "activity_created_at_idx",
    "activity_entity_id_created_at_idx",
    "attention_user_occurrence_key_unique",
    "attention_user_res_dis_read_created_idx",
  ];

  it.each(expectedIndexes)("index %s is registered in sqlite_master", (name) => {
    const row = db.connection
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?`,
      )
      .get(name) as { name: string } | undefined;

    expect(row?.name).toBe(name);
  });
});

// ---------------------------------------------------------------------------
// 5. attention occurrence_key uniqueness
// ---------------------------------------------------------------------------

describe("attention occurrence_key uniqueness", () => {
  it("duplicate (user_id, occurrence_key) is rejected", () => {
    const userId = "user-attn";
    seedUser(db, userId, "attnuser");

    const entityId = "ent-attn";
    seedEntity(db, entityId, userId);

    const insertAttn = () =>
      db.connection
        .prepare(
          `INSERT INTO attention
           (id, user_id, reason, entity_id, source_type, source_id, occurrence_key)
           VALUES (lower(hex(randomblob(16))), ?, 'reminder', ?, 'reminder', 'src-1', 'key-1')`,
        )
        .run(userId, entityId);

    insertAttn(); // first insert succeeds
    expect(insertAttn).toThrow(/UNIQUE constraint/i);
  });
});
