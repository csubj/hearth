/**
 * Trash purge job logic (design D7/D8/D11/D15, task 6.7).
 *
 * `purgeTrash(conn, now)` permanently removes trashed entities older than 30
 * days, in batches of 200 per transaction so the event loop is not blocked for
 * long. Dependent records (tags, links, comments, reminders, attachments,
 * activity, attention, search index) are removed via ON DELETE CASCADE or the
 * write pipeline's search reindex. Attachment files are unlinked AFTER commit
 * using the write pipeline's `afterCommit`.
 */

import "server-only";

import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type Database from "better-sqlite3";

import * as schema from "../db/schema";
import { writeWithDb, type WriteContext } from "./write";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Trashed entities older than 30 days are purged (entities spec). */
export const PURGE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Purge works in batches of 200 entities per transaction (design D11).
 */
export const PURGE_BATCH_SIZE = 200;

/** Resolve the uploads directory (design D15). */
export function resolveUploadsDir(): string {
  return process.env.UPLOADS_DIR ?? join(process.cwd(), "data", "uploads");
}

/** Resolve the on-disk path for a storage key. */
export function fileForStorageKey(
  uploadsDir: string,
  storageKey: string,
): string {
  return join(uploadsDir, storageKey);
}

// ---------------------------------------------------------------------------
// purgeTrash
// ---------------------------------------------------------------------------

/**
 * Permanently delete trashed entities older than 30 days.
 *
 * Loops over batches of `PURGE_BATCH_SIZE`, hard-deleting the entity rows
 * inside one write transaction. Attachment files for the purged entities are
 * collected before the delete and unlinked in `afterCommit` (only after the
 * transaction commits, so a rollback leaves the files intact).
 *
 * @param conn - the better-sqlite3 connection (the instance's one).
 * @param now - current time (injectable for a fake-clock test).
 * @param uploadsDir - where attachment files live.
 */
export async function purgeTrash(
  conn: Database.Database,
  now: Date,
  uploadsDir: string = resolveUploadsDir(),
): Promise<{ purged: number; filesUnlinked: number }> {
  const cutoff = now.getTime() - PURGE_AGE_MS;
  const client = drizzle(conn, { schema });

  let totalPurged = 0;
  let totalFilesUnlinked = 0;

  while (true) {
    // Select one batch of trashed entities older than the cutoff.
    const batch = conn
      .prepare(
        `SELECT id FROM entities
         WHERE deleted_at IS NOT NULL AND deleted_at < ?
         ORDER BY deleted_at ASC, id ASC
         LIMIT ?`,
      )
      .all(cutoff, PURGE_BATCH_SIZE) as Array<{ id: string }>;

    if (batch.length === 0) break;

    const ids = batch.map((r) => r.id);
    const placeholders = ids.map(() => "?").join(",");

    // Collect attachment files BEFORE deleting so the rows still exist.
    const storageKeys = (
      conn
        .prepare(
          `SELECT storage_key FROM attachments WHERE entity_id IN (${placeholders})`,
        )
        .all(...ids) as Array<{ storage_key: string }>
    ).map((r) => fileForStorageKey(uploadsDir, r.storage_key));

    const ctx: WriteContext = {
      user: { id: "__system__" },
      via: "web",
      now: now.getTime(),
      requestId: randomUUID(),
    };

    await writeWithDb(
      client,
      ctx,
      (_tx, changes) => {
        // The raw connection shared with the Drizzle transaction; the write
        // pipeline executes fn inside `client.transaction(...)`, so these
        // statements participate in that same transaction.
        conn
          .prepare(`DELETE FROM entities WHERE id IN (${placeholders})`)
          .run(...ids);
        // Touch so the write pipeline reindexes (removes) the search rows.
        for (const id of ids) changes.touch(id);
      },
      {
        // Unlink attachment files only after a successful commit.
        afterCommit: async () => {
          for (const file of storageKeys) {
            await unlink(file).catch(() => {
              // Missing files are fine; the orphan sweep handles strays.
            });
          }
        },
      },
    );

    totalPurged += ids.length;
    totalFilesUnlinked += storageKeys.length;

    if (batch.length < PURGE_BATCH_SIZE) break;
  }

  return { purged: totalPurged, filesUnlinked: totalFilesUnlinked };
}
