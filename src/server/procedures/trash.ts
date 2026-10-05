/**
 * Trash procedures (task 6.7, design D7/D8).
 *
 * A trash view (`listTrashed`) across all modules and batch restore
 * (`restoreBatch`) that restores an entire trash group by `trash_batch_id`
 * (e.g. a place and its subtree, shared-trashed set). Permanent purge is a
 * separate daily job in `src/server/jobs.ts` (driven by `purgeTrash`).
 */

import "server-only";

import * as z from "zod";

import { ORPCError } from "@orpc/server";

import { member, ERROR_STATUS_MAP } from "../orpc";
import { writeWithDb, type WriteContext } from "../write";
import { db } from "../../db";

// ---------------------------------------------------------------------------
// Cursor encoding / decoding for listTrashed (keyset on deleted_at + id)
// ---------------------------------------------------------------------------

interface TrashCursorPayload {
  deletedAt: number | null;
  id: string;
}

function encodeTrashCursor(payload: TrashCursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeTrashCursor(cursor: string): TrashCursorPayload {
  try {
    const raw = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as TrashCursorPayload;
    if (typeof raw.id !== "string") throw new Error("malformed");
    return raw;
  } catch {
    throw new ORPCError("validation_error", {
      status: ERROR_STATUS_MAP.validation_error,
      message: "Invalid cursor.",
      data: {
        details: [{ path: "cursor", message: "Malformed cursor value" }],
      },
    });
  }
}

// ---------------------------------------------------------------------------
// listTrashed — trash view across all modules
// ---------------------------------------------------------------------------

export const listTrashed = member
  .route({ method: "GET", path: "/trash" })
  .input(
    z.object({
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional(),
    }),
  )
  .handler(({ input }) => {
    const limit = input.limit ?? 50;
    const conn = (db as unknown as { $client: import("better-sqlite3").Database })
      .$client;

    let cursorPayload: TrashCursorPayload | null = null;
    if (input.cursor) {
      cursorPayload = decodeTrashCursor(input.cursor);
    }

    const whereClauses: string[] = ["e.deleted_at IS NOT NULL"];
    const params: unknown[] = [];
    if (cursorPayload) {
      // Keyset: deleted_at < cursor.deleted_at, tiebreak by id < cursor.id
      whereClauses.push(
        "(e.deleted_at < ? OR (e.deleted_at = ? AND e.id < ?))",
      );
      params.push(cursorPayload.deletedAt, cursorPayload.deletedAt, cursorPayload.id);
    }
    const whereSQL = whereClauses.join(" AND ");

    const rows = conn
      .prepare(
        `SELECT e.id, e.type, e.title, e.place_id, e.deleted_at, e.trash_batch_id
         FROM entities e
         WHERE ${whereSQL}
         ORDER BY e.deleted_at DESC, e.id DESC
         LIMIT ?`,
      )
      .all(...params, limit + 1) as Array<Record<string, unknown>>;

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const data = pageRows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      placeId: row.place_id ?? null,
      deletedAt: row.deleted_at ?? null,
      trashBatchId: row.trash_batch_id ?? null,
    }));

    let nextCursor: string | null = null;
    if (hasMore && pageRows.length > 0) {
      const last = pageRows[pageRows.length - 1]!;
      nextCursor = encodeTrashCursor({
        deletedAt: (last.deleted_at as number | null) ?? null,
        id: String(last.id),
      });
    }

    return { data, nextCursor };
  });

// ---------------------------------------------------------------------------
// restoreBatch — restore an entire trash group by trash_batch_id
// ---------------------------------------------------------------------------

/**
 * Shared batch-restore implementation, used by the generic `restoreBatch`
 * procedure and by `restore` in the places procedures (task 7.6).
 *
 * Restores every trashed entity in the batch. A place whose parent is still
 * trashed (and is not part of this same batch) is refused with `conflict`:
 * the parent must be restored first (design D7).
 */
export async function restoreBatchImpl(
  context: WriteContext,
  trashBatchId: string,
): Promise<{ restored: number }> {
  return writeWithDb(
    db,
    context,
    (tx, changes) => {
      const conn = (
        tx as unknown as { $client: import("better-sqlite3").Database }
      ).$client ?? (
        db as unknown as { $client: import("better-sqlite3").Database }
      ).$client;

      // Load the affected trashed entities in the batch.
      const rows = conn
        .prepare(
          "SELECT id, place_id FROM entities WHERE trash_batch_id = ? AND deleted_at IS NOT NULL",
        )
        .all(trashBatchId) as Array<{ id: string; place_id: string | null }>;

      if (rows.length === 0) {
        throw new ORPCError("not_found", {
          status: ERROR_STATUS_MAP.not_found,
          message: "No trashed entities found for this batch.",
        });
      }

      // Refuse to restore a child of a trashed parent that is not in this
      // same batch (D7): the parent must be restored first.
      for (const row of rows) {
        if (!row.place_id) continue;
        const parent = conn
          .prepare(
            "SELECT deleted_at, trash_batch_id FROM entities WHERE id = ?",
          )
          .get(row.place_id) as
          | { deleted_at: number | null; trash_batch_id: string | null }
          | undefined;
        if (
          parent?.deleted_at !== null &&
          parent?.deleted_at !== undefined &&
          parent?.trash_batch_id !== trashBatchId
        ) {
          throw new ORPCError("conflict", {
            status: ERROR_STATUS_MAP.conflict,
            message:
              "Cannot restore this place while its parent is still in trash. Restore the parent first.",
          });
        }
      }

      for (const row of rows) {
        conn
          .prepare(
            `UPDATE entities
             SET deleted_at = NULL, trash_batch_id = NULL,
                 updated_by = ?, updated_at = ?, version = version + 1
             WHERE id = ?`,
          )
          .run(context.user.id, context.now, row.id);
        changes.touch(row.id);
        changes.addActivity({
          entityId: row.id,
          action: "restore",
          diff: {},
        });
      }

      return { restored: rows.length };
    },
  );
}

export const restoreBatch = member
  .route({ method: "POST", path: "/trash/restore-batch" })
  .input(z.object({ trashBatchId: z.string() }))
  .handler(async ({ context, input }) => {
    const result = await restoreBatchImpl(context as WriteContext, input.trashBatchId);
    return { ok: true, restored: result.restored };
  });
