/**
 * Tests for the write pipeline (task 3.3).
 *
 * Uses `createTestDatabase()` for an in-memory SQLite with all migrations
 * applied, and `writeWithDb()` which injects the db handle into context.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  type TestDatabase,
} from "../db/testing";
import {
  writeWithDb,
  ChangeSet,
  type WriteContext,
  type WriteTx,
} from "./write";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedUser(db: TestDatabase, id: string, username: string) {
  db.connection
    .prepare(
      `INSERT INTO user
       (id, name, email, email_verified, created_at, updated_at, username, role)
       VALUES (?, ?, ?, 0, unixepoch()*1000, unixepoch()*1000, ?, 'user')`,
    )
    .run(id, username, `${username}@users.hearth.invalid`, username);
}

function seedEntity(
  db: TestDatabase,
  id: string,
  userId: string,
  opts: { type?: string; title?: string } = {},
) {
  db.connection
    .prepare(
      `INSERT INTO entities
       (id, type, title, version, created_by, updated_by)
       VALUES (?, ?, ?, 1, ?, ?)`,
    )
    .run(id, opts.type ?? "test", opts.title ?? "Test", userId, userId);
}

function makeCtx(
  userId: string,
  overrides: Partial<WriteContext> = {},
): WriteContext {
  return {
    user: { id: userId },
    via: "web",
    now: Date.now(),
    requestId: "req-test",
    ...overrides,
  };
}

function countRows(db: TestDatabase, table: string): number {
  const row = db.connection
    .prepare(`SELECT COUNT(*) as cnt FROM ${table}`)
    .get() as { cnt: number };
  return row.cnt;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let tdb: TestDatabase;

beforeEach(() => {
  tdb = createTestDatabase();
});

// ---------------------------------------------------------------------------
// 1. Rollback leaves no side-effect rows
// ---------------------------------------------------------------------------

describe("rollback on error", () => {
  it("a thrown error inside fn leaves NO activity, search_index, or attention rows", async () => {
    const userId = "u-rollback";
    seedUser(tdb, userId, "rollback");
    seedEntity(tdb, "e-rollback", userId, { title: "Rollback Test" });

    const ctx = makeCtx(userId);

    await expect(
      writeWithDb(tdb.client, ctx, (tx, changes) => {
        // Record some changes that would normally be flushed
        changes.recordFieldDiff("e-rollback", "title", "old", "new");
        changes.addAttention({
          userId,
          reason: "mention",
          entityId: "e-rollback",
          sourceType: "note",
          sourceId: "src-1",
          occurrenceKey: "mention:note:src-1:" + userId + ":w1",
        });
        changes.touch("e-rollback");

        // Now throw
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    // Nothing persisted
    expect(countRows(tdb, "activity")).toBe(0);
    expect(countRows(tdb, "attention")).toBe(0);

    // FTS5: no rows should have been inserted
    const ftsCount = tdb.connection
      .prepare("SELECT COUNT(*) as cnt FROM search_index")
      .get() as { cnt: number };
    expect(ftsCount.cnt).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. afterCommit does NOT run on rollback
// ---------------------------------------------------------------------------

describe("afterCommit", () => {
  it("does NOT run when the transaction rolls back", async () => {
    const userId = "u-aftercommit";
    seedUser(tdb, userId, "aftercommit");

    let afterCommitRan = false;

    await expect(
      writeWithDb(
        tdb.client,
        makeCtx(userId),
        () => {
          throw new Error("rollback");
        },
        {
          afterCommit: async () => {
            afterCommitRan = true;
          },
        },
      ),
    ).rejects.toThrow("rollback");

    expect(afterCommitRan).toBe(false);
  });

  it("runs after a successful commit", async () => {
    const userId = "u-aftercommit-ok";
    seedUser(tdb, userId, "aftercommitok");

    let afterCommitRan = false;

    await writeWithDb(
      tdb.client,
      makeCtx(userId),
      () => {
        return { ok: true };
      },
      {
        afterCommit: async () => {
          afterCommitRan = true;
        },
      },
    );

    expect(afterCommitRan).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Activity coalescing (D12)
// ---------------------------------------------------------------------------

describe("activity coalescing", () => {
  it("three updates within 5 min by same actor produce ONE activity row", async () => {
    const userId = "u-coalesce";
    seedUser(tdb, userId, "coalesce");
    seedEntity(tdb, "e-coalesce", userId, { title: "Coalesce" });

    const baseTime = Date.now();

    // First update
    await writeWithDb(
      tdb.client,
      makeCtx(userId, { now: baseTime }),
      (_tx, changes) => {
        changes.recordFieldDiff("e-coalesce", "title", "A", "B");
      },
    );

    // Second update at +1 minute
    await writeWithDb(
      tdb.client,
      makeCtx(userId, { now: baseTime + 60_000 }),
      (_tx, changes) => {
        changes.recordFieldDiff("e-coalesce", "title", "B", "C");
      },
    );

    // Third update at +2 minutes
    await writeWithDb(
      tdb.client,
      makeCtx(userId, { now: baseTime + 120_000 }),
      (_tx, changes) => {
        changes.recordFieldDiff("e-coalesce", "title", "C", "D");
      },
    );

    // Should be exactly 1 activity row
    expect(countRows(tdb, "activity")).toBe(1);

    // The row should have first before (A) and last after (D)
    const row = tdb.connection
      .prepare("SELECT diff FROM activity WHERE entity_id = 'e-coalesce'")
      .get() as { diff: string };

    const diff = JSON.parse(row.diff) as {
      fields: Record<string, [unknown, unknown]>;
    };
    expect(diff.fields.title[0]).toBe("A");
    expect(diff.fields.title[1]).toBe("D");
  });

  it("does not coalesce when a different actor intervenes", async () => {
    const user1 = "u-coalesce-a";
    const user2 = "u-coalesce-b";
    seedUser(tdb, user1, "coalescea");
    seedUser(tdb, user2, "coalesceb");
    seedEntity(tdb, "e-coalesce-2", user1, { title: "Coalesce2" });

    const baseTime = Date.now();

    // User1 updates
    await writeWithDb(
      tdb.client,
      makeCtx(user1, { now: baseTime }),
      (_tx, changes) => {
        changes.recordFieldDiff("e-coalesce-2", "title", "A", "B");
      },
    );

    // User2 updates same entity (intervenes)
    await writeWithDb(
      tdb.client,
      makeCtx(user2, { now: baseTime + 30_000 }),
      (_tx, changes) => {
        changes.recordFieldDiff("e-coalesce-2", "title", "B", "C");
      },
    );

    // User1 updates again
    await writeWithDb(
      tdb.client,
      makeCtx(user1, { now: baseTime + 60_000 }),
      (_tx, changes) => {
        changes.recordFieldDiff("e-coalesce-2", "title", "C", "D");
      },
    );

    // Should be 3 rows (no coalescing due to intervention)
    expect(countRows(tdb, "activity")).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 4. Attention dedup by occurrence key
// ---------------------------------------------------------------------------

describe("attention dedup", () => {
  it("a duplicate occurrence key inserts only one attention row", async () => {
    const userId = "u-attn-dedup";
    seedUser(tdb, userId, "attndedup");
    seedEntity(tdb, "e-attn-dedup", userId, { title: "Attn" });

    const occurrenceKey = "reminder:r1:2025-01-01:" + userId;

    // First write with an attention item
    await writeWithDb(
      tdb.client,
      makeCtx(userId),
      (_tx, changes) => {
        changes.addAttention({
          userId,
          reason: "reminder",
          entityId: "e-attn-dedup",
          sourceType: "reminder",
          sourceId: "r1",
          occurrenceKey,
        });
      },
    );

    // Second write with the same occurrence key
    await writeWithDb(
      tdb.client,
      makeCtx(userId),
      (_tx, changes) => {
        changes.addAttention({
          userId,
          reason: "reminder",
          entityId: "e-attn-dedup",
          sourceType: "reminder",
          sourceId: "r1",
          occurrenceKey,
        });
      },
    );

    expect(countRows(tdb, "attention")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 5. Idempotency key replay
// ---------------------------------------------------------------------------

describe("idempotency", () => {
  it("a replayed key+hash returns stored result without re-writing", async () => {
    const userId = "u-idemp";
    const apiKeyId = "ak-idemp";
    seedUser(tdb, userId, "idemp");

    const ctx = makeCtx(userId, {
      via: { apiKeyId, name: "TestKey" },
    });

    const idempKey = "idem-key-1";
    const hash = "hash-abc";

    // First write: creates an entity
    const result1 = await writeWithDb(tdb.client, ctx, (tx, changes) => {
      tdb.connection
        .prepare(
          `INSERT INTO entities
           (id, type, title, version, created_by, updated_by)
           VALUES ('e-idemp', 'test', 'Idempotent', 1, ?, ?)`,
        )
        .run(userId, userId);
      changes.touch("e-idemp");
      changes.addActivity({
        entityId: "e-idemp",
        action: "create",
        diff: {},
      });
      return { id: "e-idemp" };
    }, {
      idempotencyKey: idempKey,
      requestHash: hash,
    });

    expect(result1).toEqual({ id: "e-idemp" });
    const entitiesAfterFirst = countRows(tdb, "entities");
    const activityAfterFirst = countRows(tdb, "activity");

    // Second write: same key + same hash → should return stored result
    const result2 = await writeWithDb(tdb.client, ctx, (tx, changes) => {
      // This should NOT execute because the idempotency check returns early
      tdb.connection
        .prepare(
          `INSERT INTO entities
           (id, type, title, version, created_by, updated_by)
           VALUES ('e-idemp-2', 'test', 'Should Not Exist', 1, ?, ?)`,
        )
        .run(userId, userId);
      changes.touch("e-idemp-2");
      return { id: "e-idemp-2" };
    }, {
      idempotencyKey: idempKey,
      requestHash: hash,
    });

    // Should return the first result
    expect(result2).toEqual({ id: "e-idemp" });

    // No new entity or activity created
    expect(countRows(tdb, "entities")).toBe(entitiesAfterFirst);
    expect(countRows(tdb, "activity")).toBe(activityAfterFirst);
  });

  it("a replayed key with a different hash throws conflict", async () => {
    const userId = "u-idemp-conflict";
    const apiKeyId = "ak-idemp-conflict";
    seedUser(tdb, userId, "idempconflict");

    const ctx = makeCtx(userId, {
      via: { apiKeyId, name: "TestKey" },
    });

    // First write
    await writeWithDb(tdb.client, ctx, () => ({ ok: true }), {
      idempotencyKey: "idem-conflict",
      requestHash: "hash-1",
    });

    // Second write with different hash
    await expect(
      writeWithDb(tdb.client, ctx, () => ({ ok: true }), {
        idempotencyKey: "idem-conflict",
        requestHash: "hash-2",
      }),
    ).rejects.toThrow(/idempotency/i);
  });
});

// ---------------------------------------------------------------------------
// 6. Search reindex on touched entities
// ---------------------------------------------------------------------------

describe("search reindex", () => {
  it("touching an entity creates a search_index row", async () => {
    const userId = "u-search";
    seedUser(tdb, userId, "searchuser");
    seedEntity(tdb, "e-search", userId, { title: "Searchable Item" });

    await writeWithDb(tdb.client, makeCtx(userId), (_tx, changes) => {
      changes.touch("e-search");
    });

    const row = tdb.connection
      .prepare(
        "SELECT entity_id, title, body FROM search_index WHERE entity_id = ?",
      )
      .get("e-search") as
      | { entity_id: string; title: string; body: string }
      | undefined;

    expect(row).toBeDefined();
    expect(row!.title).toBe("Searchable Item");
  });
});

// ---------------------------------------------------------------------------
// 7. Type-level: async fn is rejected
// ---------------------------------------------------------------------------

describe("type safety", () => {
  it("rejects a promise-returning fn at the type level", () => {
    // Compile-time only check: this function is never called.
    // If the NoPromise constraint is working, the @ts-expect-error
    // below is required — removing it would cause a compile error.
    const _typeTest = () => {
      // @ts-expect-error — async fn returns Promise, which is rejected by NoPromise<R>
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _unused: unknown = writeWithDb(tdb.client, makeCtx("u"), async (_tx: WriteTx, _changes: ChangeSet) => {
        return { ok: true };
      });
      void _unused;
    };
    // Verify the function reference exists but do NOT call it
    expect(typeof _typeTest).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// 8. prepare receives context and result is available to afterCommit
// ---------------------------------------------------------------------------

describe("prepare + afterCommit pipeline", () => {
  it("prepare runs before fn, afterCommit receives result and prepared", async () => {
    const userId = "u-pipeline";
    seedUser(tdb, userId, "pipeline");

    const log: string[] = [];

    const result = await writeWithDb(
      tdb.client,
      makeCtx(userId),
      (tx, changes) => {
        void tx;
        void changes;
        log.push("fn");
        return { value: 42 };
      },
      {
        prepare: async () => {
          log.push("prepare");
          return { tempFile: "/tmp/test" };
        },
        afterCommit: async (_ctx, res, prepared) => {
          log.push("afterCommit");
          expect(res).toEqual({ value: 42 });
          expect(prepared).toEqual({ tempFile: "/tmp/test" });
        },
      },
    );

    expect(result).toEqual({ value: 42 });
    expect(log).toEqual(["prepare", "fn", "afterCommit"]);
  });
});
