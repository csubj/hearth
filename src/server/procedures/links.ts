/**
 * Entity link procedures (task 8.2, design D8).
 *
 * Links any two entities with a relation from a fixed set: related, part_of,
 * uses, fixes, replaces. Links are visible from both sides with a
 * direction-appropriate label. `related` is symmetric and stored with
 * from_id < to_id. Duplicate (same pair + relation) → conflict. Links to
 * trashed entities are hidden from list output.
 *
 *  list   GET  /entities/{id}/links
 *  add    POST /entities/{id}/links   — body { toId, relation }
 *  remove DELETE /entities/{id}/links/{linkId}
 */

import "server-only";

import { randomUUID } from "node:crypto";
import * as z from "zod";
import { ORPCError } from "@orpc/server";

import { member, ERROR_STATUS_MAP } from "../orpc";
import { writeWithDb, type WriteContext } from "../write";
import { assertEntityFeature } from "../entity-feature";
import { db } from "../../db";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const LINK_RELATIONS = [
  "related",
  "part_of",
  "uses",
  "fixes",
  "replaces",
] as const;

export type LinkRelation = (typeof LINK_RELATIONS)[number];

/** Direction-appropriate labels for each side of a relation. */
const LINK_LABELS: Record<
  LinkRelation,
  { from: (title: string) => string; to: (title: string) => string }
> = {
  related: {
    from: (title) => `related to ${title}`,
    to: (title) => `related to ${title}`,
  },
  part_of: {
    from: (title) => `part of ${title}`,
    to: (title) => `has part ${title}`,
  },
  uses: {
    from: (title) => `uses ${title}`,
    to: (title) => `used by ${title}`,
  },
  fixes: {
    from: (title) => `fixes ${title}`,
    to: (title) => `fixed by ${title}`,
  },
  replaces: {
    from: (title) => `replaces ${title}`,
    to: (title) => `replaced by ${title}`,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Load a live (non-trashed) entity title, or null. */
function liveEntityTitle(
  conn: import("better-sqlite3").Database,
  id: string,
): string | null {
  const row = conn
    .prepare("SELECT title FROM entities WHERE id = ? AND deleted_at IS NULL")
    .get(id) as { title: string } | undefined;
  return row?.title ?? null;
}

/** Normalize a related pair so from_id < to_id (symmetric storage, D8). */
function normalizeRelated(
  fromId: string,
  toId: string,
): { fromId: string; toId: string } {
  return fromId < toId
    ? { fromId, toId }
    : { fromId: toId, toId: fromId };
}

// ---------------------------------------------------------------------------
// list — links involving an entity, both directions
// ---------------------------------------------------------------------------

export const list = member
  .route({ method: "GET", path: "/entities/{id}/links" })
  .input(z.object({ id: z.string() }))
  .handler(({ input }) => {
    assertEntityFeature(input.id, "links");

    const conn = (db as unknown as { $client: import("better-sqlite3").Database })
      .$client;
    const rows = conn
      .prepare(
        `SELECT l.id, l.from_id, l.to_id, l.relation
         FROM entity_links l
         WHERE l.from_id = ? OR l.to_id = ?
         ORDER BY l.created_at ASC`,
      )
      .all(input.id, input.id) as Array<{
      id: string;
      from_id: string;
      to_id: string;
      relation: LinkRelation;
    }>;

    const data = [];
    for (const row of rows) {
      const isFrom = row.from_id === input.id;
      const otherId = isFrom ? row.to_id : row.from_id;
      // Links to trashed entities are hidden (spec).
      const otherTitle = liveEntityTitle(conn, otherId);
      if (otherTitle === null) continue;

      const label = isFrom
        ? LINK_LABELS[row.relation].from(otherTitle)
        : LINK_LABELS[row.relation].to(otherTitle);

      data.push({
        id: row.id,
        relation: row.relation,
        direction: isFrom ? "out" : "in",
        otherEntityId: otherId,
        otherTitle,
        label,
      });
    }

    return { data };
  });

// ---------------------------------------------------------------------------
// add
// ---------------------------------------------------------------------------

export const add = member
  .route({ method: "POST", path: "/entities/{id}/links" })
  .input(
    z.object({
      id: z.string(),
      toId: z.string(),
      relation: z.enum(LINK_RELATIONS),
    }),
  )
  .handler(async ({ context, input }) => {
    assertEntityFeature(input.id, "links");

    if (input.id === input.toId) {
      throw new ORPCError("validation_error", {
        status: ERROR_STATUS_MAP.validation_error,
        message: "An entity cannot be linked to itself.",
        data: {
          details: [{ path: "toId", message: "Cannot link an entity to itself." }],
        },
      });
    }

    const linkId = randomUUID();

    const result = await writeWithDb(
      db,
      context as WriteContext,
      (tx, changes) => {
        const conn = (
          tx as unknown as { $client: import("better-sqlite3").Database }
        ).$client ?? (
          db as unknown as { $client: import("better-sqlite3").Database }
        ).$client;

        assertEntityFeature(input.id, "links");

        // Target must exist and not be trashed.
        if (liveEntityTitle(conn, input.toId) === null) {
          throw new ORPCError("not_found", {
            status: ERROR_STATUS_MAP.not_found,
            message: "Target entity not found.",
          });
        }

        // Normalize `related` to a canonical from < to ordering (symmetric).
        const { fromId, toId } =
          input.relation === "related"
            ? normalizeRelated(input.id, input.toId)
            : { fromId: input.id, toId: input.toId };

        // Duplicate (same pair + relation) → conflict. For `related`, the
        // swapped pair collides with the canonical ordering, so we check the
        // canonical pair only (after normalization) for related, and the
        // literal pair for directional relations.
        const dup = conn
          .prepare(
            "SELECT 1 FROM entity_links WHERE from_id = ? AND to_id = ? AND relation = ?",
          )
          .get(fromId, toId, input.relation);
        if (dup) {
          throw new ORPCError("conflict", {
            status: ERROR_STATUS_MAP.conflict,
            message: "This link already exists.",
          });
        }

        conn
          .prepare(
            "INSERT INTO entity_links (id, from_id, to_id, relation, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .run(linkId, fromId, toId, input.relation, context.user.id, context.now);

        // Record the set delta (D12) on both endpoints.
        changes.addSetDelta(`links:${fromId}`, [`${toId}:${input.relation}`], []);
        if (toId !== fromId) {
          changes.addSetDelta(`links:${toId}`, [`${fromId}:${input.relation}`], []);
        }
        changes.addActivity({
          entityId: fromId,
          action: "link",
          diff: { sets: { links: { added: [`${toId}:${input.relation}`], removed: [] } } },
        });
        changes.touch(fromId);
        changes.touch(toId);

        return { id: linkId };
      },
    );

    return { id: result.id };
  });

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

export const remove = member
  .route({ method: "DELETE", path: "/entities/{id}/links/{linkId}" })
  .input(z.object({ id: z.string(), linkId: z.string() }))
  .handler(async ({ context, input }) => {
    assertEntityFeature(input.id, "links");

    await writeWithDb(
      db,
      context as WriteContext,
      (tx, changes) => {
        const conn = (
          tx as unknown as { $client: import("better-sqlite3").Database }
        ).$client ?? (
          db as unknown as { $client: import("better-sqlite3").Database }
        ).$client;

        assertEntityFeature(input.id, "links");

        const row = conn
          .prepare(
            "SELECT from_id, to_id, relation FROM entity_links WHERE id = ?",
          )
          .get(input.linkId) as
          | { from_id: string; to_id: string; relation: string }
          | undefined;

        if (!row || (row.from_id !== input.id && row.to_id !== input.id)) {
          throw new ORPCError("not_found", {
            status: ERROR_STATUS_MAP.not_found,
            message: "Link not found.",
          });
        }

        conn.prepare("DELETE FROM entity_links WHERE id = ?").run(input.linkId);

        changes.addSetDelta(`links:${row.from_id}`, [], [`${row.to_id}:${row.relation}`]);
        changes.addSetDelta(`links:${row.to_id}`, [], [`${row.from_id}:${row.relation}`]);
        changes.addActivity({
          entityId: row.from_id,
          action: "link",
          diff: { sets: { links: { added: [], removed: [`${row.to_id}:${row.relation}`] } } },
        });
        changes.touch(row.from_id);
        changes.touch(row.to_id);
      },
    );

    return { ok: true };
  });
