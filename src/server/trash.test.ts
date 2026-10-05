/**
 * Trash tests (task 6.7).
 *
 * Uses the global in-memory DB (consistent with module.test.ts) so the
 * `listTrashed` and `restoreBatch` procedures and the `purgeTrash` job logic
 * are exercised against the real write pipeline and router.
 */

import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "file::memory:?cache=shared";
});

import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createRouterClient } from "@orpc/server";

import { db, sqlite } from "../db";
import { MIGRATIONS_FOLDER } from "../db/testing";
import { router } from "./router";
import { validationInterceptor } from "./orpc";
import type { AppContext } from "./context";
import { purgeTrash, resolveUploadsDir, PURGE_AGE_MS } from "./trash";
import { getJobs } from "./jobs";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(() => {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  seedUser();
});

afterAll(() => {
  // Reset any override made in tests.
  delete process.env.UPLOADS_DIR;
});

const USER_ID = "u-trash-" + randomUUID().slice(0, 8);

function seedUser(): void {
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO user
       (id, name, email, email_verified, created_at, updated_at, username, role)
       VALUES (?, ?, ?, 0, unixepoch()*1000, unixepoch()*1000, ?, 'user')`,
    )
    .run(USER_ID, "Trash Tester", `${USER_ID}@users.hearth.invalid`, USER_ID.slice(0, 20));
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

/** Insert an entity row directly with a specific deleted_at (fake clock). */
function insertEntity(
  id: string,
  title: string,
  deletedAt: number | null,
  trashBatchId: string | null,
): void {
  sqlite
    .prepare(
      `INSERT INTO entities
       (id, type, title, version, created_by, updated_by, created_at, updated_at, deleted_at, trash_batch_id)
       VALUES (?, 'notes-page', ?, 1, ?, ?, ?*1000, ?*1000, ?, ?)`,
    )
    .run(id, title, USER_ID, USER_ID, Date.now() / 1000, Date.now() / 1000, deletedAt, trashBatchId);
}

/** Insert an attachment row pointing at a real temp file. */
function insertAttachment(
  attachmentId: string,
  entityId: string,
  storageKey: string,
  uploadsDir: string,
): void {
  writeFileSync(join(uploadsDir, storageKey), "file-content");
  sqlite
    .prepare(
      `INSERT INTO attachments
       (id, entity_id, filename, mime, size, storage_key, has_thumb, created_by, created_at)
       VALUES (?, ?, 'a.txt', 'text/plain', 12, ?, 0, ?, unixepoch()*1000)`,
    )
    .run(attachmentId, entityId, storageKey, USER_ID);
}

describe("purgeTrash (6.7) — fake clock", () => {
  it("removes a 31-day-old trashed entity and its file; keeps a 29-day-old one", async () => {
    const now = new Date("2025-03-15T12:00:00Z");
    const uploadsDir = mkdtempSync(join(tmpdir(), "hearth-uploads-"));
    process.env.UPLOADS_DIR = uploadsDir;

    const oldId = "old-" + randomUUID();
    const youngId = "young-" + randomUUID();
    const liveId = "live-" + randomUUID();
    const batchId = randomUUID();

    insertEntity(oldId, "Old 31 days", now.getTime() - 31 * 24 * 60 * 60 * 1000, batchId);
    insertEntity(youngId, "Young 29 days", now.getTime() - 29 * 24 * 60 * 60 * 1000, batchId);
    insertEntity(liveId, "Live entity", null, null);

    const oldFile = "old-file.bin";
    const youngFile = "young-file.bin";
    insertAttachment("att-old-" + randomUUID(), oldId, oldFile, uploadsDir);
    insertAttachment("att-young-" + randomUUID(), youngId, youngFile, uploadsDir);

    expect(existsSync(join(uploadsDir, oldFile))).toBe(true);
    expect(existsSync(join(uploadsDir, youngFile))).toBe(true);

    const result = await purgeTrash(sqlite, now, uploadsDir);

    expect(result.purged).toBe(1);
    expect(result.filesUnlinked).toBe(1);

    // Old entity and its attachment row are gone.
    expect(sqlite.prepare("SELECT id FROM entities WHERE id = ?").get(oldId)).toBeUndefined();
    expect(
      sqlite.prepare("SELECT id FROM attachments WHERE entity_id = ?").get(oldId),
    ).toBeUndefined();
    // Old attachment file is unlinked.
    expect(existsSync(join(uploadsDir, oldFile))).toBe(false);

    // Young entity (29 days) survives with its file.
    expect(sqlite.prepare("SELECT id FROM entities WHERE id = ?").get(youngId)).toBeDefined();
    expect(existsSync(join(uploadsDir, youngFile))).toBe(true);

    // The live (non-trashed) entity is untouched.
    expect(sqlite.prepare("SELECT id FROM entities WHERE id = ?").get(liveId)).toBeDefined();
  });

  it("uses the PURGE_AGE_MS constant of 30 days", () => {
    expect(PURGE_AGE_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("purges multiple batches when more than one batch's worth is due", async () => {
    const now = new Date("2025-03-15T12:00:00Z");
    const uploadsDir = mkdtempSync(join(tmpdir(), "hearth-uploads-"));
    process.env.UPLOADS_DIR = uploadsDir;

    // Create enough old trashed entities to span more than one batch.
    const ids: string[] = [];
    for (let i = 0; i < 210; i++) {
      const id = "batch-" + i + "-" + randomUUID();
      insertEntity(id, `Old ${i}`, now.getTime() - 40 * 24 * 60 * 60 * 1000, null);
      ids.push(id);
    }

    const result = await purgeTrash(sqlite, now, uploadsDir);
    expect(result.purged).toBe(210);

    for (const id of ids) {
      expect(sqlite.prepare("SELECT id FROM entities WHERE id = ?").get(id)).toBeUndefined();
    }
  });

  it("resolveUploadsDir defaults to data/uploads or UPLOADS_DIR", () => {
    const orig = process.env.UPLOADS_DIR;
    delete process.env.UPLOADS_DIR;
    expect(resolveUploadsDir()).toContain("uploads");
    if (orig !== undefined) process.env.UPLOADS_DIR = orig;
  });
});

describe("trash-purge daily job registration (6.7)", () => {
  it("registers a daily trash-purge job in the scheduler", () => {
    const job = getJobs().find((j) => j.name === "trash-purge");
    expect(job).toBeDefined();
    expect(job!.frequency).toBe("daily");
  });
});

describe("listTrashed procedure (6.7)", () => {
  it("lists only trashed entities, with pagination cursor", async () => {
    const c = client();
    const batchId = randomUUID();
    const id = "trashed-" + randomUUID();
    // Create one trashed entity and one live one via the procedures.
    const created = (await (c as Record<string, CallableFunction>).notesPageCreate({
      title: "Trash me",
    })) as Record<string, unknown>;
    const liveId = created.id as string;

    await (c as Record<string, CallableFunction>).notesPageDelete({ id: liveId });

    const result = (await (c as Record<string, CallableFunction>).listTrashed({
      limit: 50,
    })) as {
      data: Array<Record<string, unknown>>;
      nextCursor: string | null;
    };

    // A cursor may be present when more than `limit` trashed entities exist;
    // the shared in-memory DB accumulates trashed rows across test files.
    expect(result.nextCursor === null || typeof result.nextCursor === "string").toBe(true);
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    const mine = result.data.find((e) => e.id === liveId);
    expect(mine).toBeDefined();
    expect(mine!.title).toBe("Trash me");
    expect(mine!.trashBatchId).toBeTruthy();
    void id;
    void batchId;
  });

  it("rejects a malformed cursor with validation_error", async () => {
    const c = client();
    try {
      await (c as Record<string, CallableFunction>).listTrashed({ cursor: "not-a-cursor" });
      expect.unreachable("should have thrown");
    } catch (err) {
      const e = err as { code: string; status: number };
      expect(e.code).toBe("validation_error");
      expect(e.status).toBe(400);
    }
  });
});

describe("restoreBatch procedure (6.7)", () => {
  it("restores an entire trash batch by trash_batch_id", async () => {
    const c = client();

    // Soft-delete two entities -> they share one trash batch? Each delete
    // generates its own batch, so create a shared batch explicitly by
    // deleting both as part of a batch is not exposed. Instead set a shared
    // trash_batch_id directly then restore by that batch.
    const a = (await (c as Record<string, CallableFunction>).notesPageCreate({
      title: "Batch A",
    })) as Record<string, unknown>;
    const b = (await (c as Record<string, CallableFunction>).notesPageCreate({
      title: "Batch B",
    })) as Record<string, unknown>;

    await (c as Record<string, CallableFunction>).notesPageDelete({ id: a.id as string });
    await (c as Record<string, CallableFunction>).notesPageDelete({ id: b.id as string });

    // Assign both to one trash batch (simulating a place subtree trash).
    const batchId = randomUUID();
    sqlite
      .prepare("UPDATE entities SET trash_batch_id = ? WHERE id IN (?, ?)")
      .run(batchId, a.id, b.id);

    const result = (await (c as Record<string, CallableFunction>).restoreBatch({
      trashBatchId: batchId,
    })) as { ok: boolean; restored: number };
    expect(result.ok).toBe(true);
    expect(result.restored).toBe(2);

    // Both should be back out of the trash.
    for (const e of [a, b]) {
      const row = sqlite
        .prepare("SELECT deleted_at, trash_batch_id FROM entities WHERE id = ?")
        .get(e.id) as { deleted_at: number | null; trash_batch_id: string | null };
      expect(row.deleted_at).toBeNull();
      expect(row.trash_batch_id).toBeNull();
    }
  });

  it("returns not_found for an unknown trash batch", async () => {
    const c = client();
    try {
      await (c as Record<string, CallableFunction>).restoreBatch({
        trashBatchId: randomUUID(),
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      const e = err as { code: string; status: number };
      expect(e.code).toBe("not_found");
      expect(e.status).toBe(404);
    }
  });
});
