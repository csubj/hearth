/**
 * Places procedures (tasks 7.1, 7.2, 7.5, 7.6, design D7).
 *
 * Places are entities of type 'place'; their parents are stored in
 * `entities.place_id` and the materialized path lives in `places.path`
 * (`/<rootId>/<childId>/.../`). Properties have no parent; every other kind
 * must have one.
 *
 * Procedures (routed under `/api/v1/places` on the REST side):
 *   create      — create a place (validates the parent/kind rules)
 *   move        — re-parent a place and rewrite every descendant's path
 *   tree        — list all live places (for building the tree)
 *   rollup      — subtree/extact rollup counts grouped by module
 *   delete      — trash the place and its whole subtree as one batch
 *   restore     — restore a trashed place subtree (reuses the batch restore)
 *
 * Subtree/fetch logic uses the indexed prefix range
 * `path >= :p AND path < :p || '~'` (never LIKE, design D7).
 */

import "server-only";

import { randomUUID } from "node:crypto";
import * as z from "zod";

import { ORPCError } from "@orpc/server";

import { member, ERROR_STATUS_MAP } from "../orpc";
import { writeWithDb, type WriteContext } from "../write";
import { db } from "../../db";
import { entities, places } from "../../db/schema";
import { restoreBatchImpl } from "./trash";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PLACE_KINDS = ["property", "structure", "room", "area"] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

// ---------------------------------------------------------------------------
// Low-level helpers (shared with tests via export)
// ---------------------------------------------------------------------------

/** Compute the materialized path for a place given its parent path. */
export function computePath(parentPath: string | null, id: string): string {
  return parentPath ? `${parentPath}${id}/` : `/${id}/`;
}

/**
 * Return the full set of place entity ids in the subtree rooted at `path`,
 * including the root itself, using the indexed prefix range.
 */
export function subtreePlaceIds(
  conn: import("better-sqlite3").Database,
  path: string,
): string[] {
  const rows = conn
    .prepare(
      "SELECT entity_id FROM places WHERE path >= ? AND path < ? || '~'",
    )
    .all(path, path) as Array<{ entity_id: string }>;
  return rows.map((r) => r.entity_id);
}

/** Check whether a place id references a live (non-trashed) place entity. */
function assertParentIsPlace(
  conn: import("better-sqlite3").Database,
  parentId: string | null | undefined,
): void {
  if (!parentId) return;
  const row = conn
    .prepare(
      "SELECT type FROM entities WHERE id = ? AND type = 'place' AND deleted_at IS NULL",
    )
    .get(parentId) as { type: string } | undefined;
  if (!row) {
    throw new ORPCError("validation_error", {
      status: ERROR_STATUS_MAP.validation_error,
      message: "place_id must reference a place.",
      data: {
        details: [{ path: "parentId", message: "Parent must be a place." }],
      },
    });
  }
}

/** Load a live place's entity + places row by id. */
function loadPlace(
  conn: import("better-sqlite3").Database,
  id: string,
): { id: string; title: string; kind: string; path: string; parentId: string | null } | undefined {
  const row = conn
    .prepare(
      `SELECT e.id, e.title, e.place_id, p.kind, p.path
       FROM entities e
       JOIN places p ON p.entity_id = e.id
       WHERE e.id = ? AND e.type = 'place' AND e.deleted_at IS NULL`,
    )
    .get(id) as
    | { id: string; title: string; place_id: string | null; kind: string; path: string }
    | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    path: row.path,
    parentId: row.place_id,
  };
}

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

export const create = member
  .route({ method: "POST", path: "/places" })
  .input(
    z.object({
      title: z.string().min(1).max(200),
      kind: z.enum(PLACE_KINDS),
      parentId: z.string().nullish(),
    }),
  )
  .handler(async ({ context, input }) => {
    const id = randomUUID();
    const viaLabel =
      typeof context.via === "object" ? context.via.name : null;
    const parentId = input.parentId ?? null;

    const result = await writeWithDb(
      db,
      context as WriteContext,
      (tx, changes) => {
        const conn = (
          tx as unknown as { $client: import("better-sqlite3").Database }
        ).$client ?? (
          db as unknown as { $client: import("better-sqlite3").Database }
        ).$client;

        // Rule: properties are top-level; every other kind needs a parent.
        if (input.kind === "property" && parentId) {
          throw new ORPCError("validation_error", {
            status: ERROR_STATUS_MAP.validation_error,
            message: "A property must be top-level.",
            data: {
              details: [{ path: "parentId", message: "Properties have no parent." }],
            },
          });
        }
        if (input.kind !== "property" && !parentId) {
          throw new ORPCError("validation_error", {
            status: ERROR_STATUS_MAP.validation_error,
            message: `A ${input.kind} must have a parent.`,
            data: {
              details: [{ path: "parentId", message: "Parent is required." }],
            },
          });
        }

        assertParentIsPlace(conn, parentId);

        const parentPath = parentId
          ? (conn
              .prepare("SELECT path FROM places WHERE entity_id = ?")
              .get(parentId) as { path: string }).path
          : null;
        const path = computePath(parentPath, id);

        tx.insert(entities)
          .values({
            id,
            type: "place",
            title: input.title,
            placeId: parentId,
            version: 1,
            createdBy: context.user.id,
            createdVia: viaLabel,
            updatedBy: context.user.id,
            updatedVia: viaLabel,
            createdAt: new Date(context.now),
            updatedAt: new Date(context.now),
          })
          .run();

        tx.insert(places)
          .values({ entityId: id, kind: input.kind, path })
          .run();

        changes.touch(id);
        changes.addActivity({
          entityId: id,
          action: "create",
          diff: { title: [null, input.title], kind: [null, input.kind] },
        });

        return { id, path };
      },
    );

    return {
      id: result.id,
      title: input.title,
      kind: input.kind,
      path: result.path,
      parentId,
    };
  });

// ---------------------------------------------------------------------------
// move
// ---------------------------------------------------------------------------

export const move = member
  .route({ method: "POST", path: "/places/move" })
  .input(
    z.object({
      id: z.string(),
      parentId: z.string().nullish(),
    }),
  )
  .handler(async ({ context, input }) => {
    const parentId = input.parentId ?? null;

    await writeWithDb(
      db,
      context as WriteContext,
      (tx, changes) => {
        const conn = (
          tx as unknown as { $client: import("better-sqlite3").Database }
        ).$client ?? (
          db as unknown as { $client: import("better-sqlite3").Database }
        ).$client;

        const place = loadPlace(conn, input.id);
        if (!place) {
          throw new ORPCError("not_found", {
            status: ERROR_STATUS_MAP.not_found,
            message: "Place not found.",
          });
        }

        // A property can only be a top-level place; other kinds need a parent.
        if (place.kind === "property" && parentId) {
          throw new ORPCError("validation_error", {
            status: ERROR_STATUS_MAP.validation_error,
            message: "A property must stay at the top level.",
            data: {
              details: [{ path: "parentId", message: "Properties have no parent." }],
            },
          });
        }
        if (place.kind !== "property" && !parentId) {
          throw new ORPCError("validation_error", {
            status: ERROR_STATUS_MAP.validation_error,
            message: "A place must have a parent.",
            data: {
              details: [{ path: "parentId", message: "Parent is required." }],
            },
          });
        }

        assertParentIsPlace(conn, parentId);

        const oldPath = place.path;
        const newParentPath = parentId
          ? (conn
              .prepare("SELECT path FROM places WHERE entity_id = ?")
              .get(parentId) as { path: string }).path
          : null;

        // Cycle check: reject moving a place under itself or a descendant.
        // A descendant's path starts with the moved place's path.
        if (newParentPath && newParentPath.startsWith(oldPath)) {
          throw new ORPCError("conflict", {
            status: ERROR_STATUS_MAP.conflict,
            message: "A place cannot be moved under one of its own descendants.",
            data: {
              details: [
                { path: "parentId", message: "Target is inside the moved subtree." },
              ],
            },
          });
        }

        const newPath = computePath(newParentPath, place.id);

        // Re-parent the moved node.
        conn
          .prepare(
            `UPDATE entities
             SET place_id = ?, updated_by = ?, updated_at = ?, version = version + 1
             WHERE id = ?`,
          )
          .run(parentId, context.user.id, context.now, place.id);

        // Rewrite the path prefix of the moved node and every descendant in
        // the same transaction (D7).
        conn
          .prepare(
            `UPDATE places
             SET path = ? || substr(path, ?)
             WHERE path >= ? AND path < ? || '~'`,
          )
          .run(newPath, oldPath.length + 1, oldPath, oldPath);

        changes.touch(place.id);
        changes.addActivity({
          entityId: place.id,
          action: "move",
          diff: { parent: [place.parentId, parentId], path: [oldPath, newPath] },
        });
      },
    );

    return { ok: true };
  });

// ---------------------------------------------------------------------------
// tree — list all live places (for the tree view)
// ---------------------------------------------------------------------------

export const tree = member
  .route({ method: "GET", path: "/places/tree" })
  .input(z.object({}))
  .handler(() => {
    const conn = (db as unknown as { $client: import("better-sqlite3").Database })
      .$client;
    const rows = conn
      .prepare(
        `SELECT e.id, e.title, e.place_id AS parentId, p.kind, p.path
         FROM entities e
         JOIN places p ON p.entity_id = e.id
         WHERE e.deleted_at IS NULL
         ORDER BY p.path`,
      )
      .all() as Array<{
      id: string;
      title: string;
      parentId: string | null;
      kind: string;
      path: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      kind: r.kind,
      path: r.path,
      parentId: r.parentId,
    }));
  });

// ---------------------------------------------------------------------------
// rollup — subtree / "this level only" counts grouped by module (task 7.5)
// ---------------------------------------------------------------------------

export const rollup = member
  .route({ method: "GET", path: "/places/{id}/rollup" })
  .input(z.object({ id: z.string(), exact: z.boolean().optional() }))
  .handler(({ input }) => {
    const conn = (db as unknown as { $client: import("better-sqlite3").Database })
      .$client;
    const place = loadPlace(conn, input.id);
    if (!place) {
      throw new ORPCError("not_found", {
        status: ERROR_STATUS_MAP.not_found,
        message: "Place not found.",
      });
    }

    const p = place.path;
    const exact = input.exact === true;
    // Subtree: the place and all descendants. Exact: the place itself only.
    const range = exact
      ? "pp.path = ?"
      : "(pp.path >= ? AND pp.path < ? || '~')";
    const rangeParams = exact ? [p] : [p, p];

    const groups = conn
      .prepare(
        `SELECT e.type, COUNT(*) AS count
         FROM entities e
         WHERE e.deleted_at IS NULL AND e.archived_at IS NULL
           AND e.type != 'place'
           AND EXISTS (
             SELECT 1 FROM places pp
             WHERE pp.entity_id = e.place_id AND ${range}
           )
         GROUP BY e.type
         ORDER BY count DESC`,
      )
      .all(...rangeParams) as Array<{ type: string; count: number }>;

    const children = conn
      .prepare(
        `SELECT e.id, e.title, p.kind, p.path,
                (SELECT COUNT(*) FROM entities c
                 WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
                   AND c.type != 'place'
                   AND EXISTS (
                     SELECT 1 FROM places cp
                     WHERE cp.entity_id = c.place_id
                       AND cp.path >= p.path AND cp.path < p.path || '~'
                   )) AS count
         FROM entities e
         JOIN places p ON p.entity_id = e.id
         WHERE e.place_id = ? AND e.deleted_at IS NULL`,
      )
      .all(place.id) as Array<{
      id: string;
      title: string;
      kind: string;
      path: string;
      count: number;
    }>;

    return {
      place: { id: place.id, title: place.title, kind: place.kind, path: place.path },
      exact,
      groups,
      total: groups.reduce((acc, g) => acc + g.count, 0),
      children: children.map((c) => ({
        id: c.id,
        title: c.title,
        kind: c.kind,
        path: c.path,
        count: c.count,
      })),
    };
  });

// ---------------------------------------------------------------------------
// delete — trash the place and its whole subtree as one batch (task 7.6)
// ---------------------------------------------------------------------------

export const del = member
  .route({ method: "POST", path: "/places/{id}/delete" })
  .input(z.object({ id: z.string() }))
  .handler(async ({ context, input }) => {
    const trashBatchId = randomUUID();

    const result = await writeWithDb(
      db,
      context as WriteContext,
      (tx, changes) => {
        const conn = (
          tx as unknown as { $client: import("better-sqlite3").Database }
        ).$client ?? (
          db as unknown as { $client: import("better-sqlite3").Database }
        ).$client;

        const place = loadPlace(conn, input.id);
        if (!place) {
          throw new ORPCError("not_found", {
            status: ERROR_STATUS_MAP.not_found,
            message: "Place not found.",
          });
        }

        // The subtree to trash: the place and every non-trashed descendant.
        const ids = subtreePlaceIds(conn, place.path);
        if (ids.length === 0) {
          throw new ORPCError("not_found", {
            status: ERROR_STATUS_MAP.not_found,
            message: "Place not found.",
          });
        }

        const placeholders = ids.map(() => "?").join(",");
        conn
          .prepare(
            `UPDATE entities
             SET deleted_at = ?, trash_batch_id = ?,
                 updated_by = ?, updated_at = ?, version = version + 1
             WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
          )
          .run(context.now, trashBatchId, context.user.id, context.now, ...ids);

        for (const id of ids) changes.touch(id);
        changes.addActivity({
          entityId: place.id,
          action: "delete",
          diff: { trashBatchId: [null, trashBatchId], subtreeSize: [null, ids.length] },
        });

        return { trashed: ids.length };
      },
    );

    return { ok: true, trashed: result.trashed };
  });

// ---------------------------------------------------------------------------
// restore — restore a trashed place subtree (reuses the batch restore)
// ---------------------------------------------------------------------------

export const restore = member
  .route({ method: "POST", path: "/places/{id}/restore" })
  .input(z.object({ id: z.string() }))
  .handler(async ({ context, input }) => {
    const conn = (
      db as unknown as { $client: import("better-sqlite3").Database }
    ).$client;

    const row = conn
      .prepare(
        "SELECT trash_batch_id FROM entities WHERE id = ? AND type = 'place' AND deleted_at IS NOT NULL",
      )
      .get(input.id) as { trash_batch_id: string | null } | undefined;

    if (!row?.trash_batch_id) {
      throw new ORPCError("not_found", {
        status: ERROR_STATUS_MAP.not_found,
        message: "Place not found in trash.",
      });
    }

    // Delegate to the generic batch restore (which also refuses a child of a
    // still-trashed parent — see restoreBatch).
    return restoreBatchImpl(context as WriteContext, row.trash_batch_id);
  });
