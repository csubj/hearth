/**
 * Tag procedures (task 8.1, design D8).
 *
 * Tags are shared across all modules, matched case-insensitively, and created
 * inline while tagging. Add/remove are recorded as set deltas per D12. Every
 * write goes through the write pipeline.
 *
 *  list   GET  /entities/{id}/tags           — the entity's tags
 *  add    POST /entities/{id}/tags           — body { name }; inline creation
 *  remove DELETE /entities/{id}/tags/{tagId}
 */

import "server-only";

import { randomUUID } from "node:crypto";
import * as z from "zod";
import { ORPCError } from "@orpc/server";

import { member, ERROR_STATUS_MAP } from "../orpc";
import { writeWithDb, type WriteContext } from "../write";
import { assertEntityFeature } from "../entity-feature";
import { db } from "../../db";
import { tags, entityTags } from "../../db/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a tag by name case-insensitively, returning its id. Returns null if
 * no tag with that name exists.
 */
function findTagIdByName(
  conn: import("better-sqlite3").Database,
  name: string,
): string | null {
  const row = conn
    .prepare(
      "SELECT id FROM tags WHERE name = ? COLLATE NOCASE",
    )
    .get(name) as { id: string } | undefined;
  return row?.id ?? null;
}

// ---------------------------------------------------------------------------
// list — the tags on an entity
// ---------------------------------------------------------------------------

export const list = member
  .route({ method: "GET", path: "/entities/{id}/tags" })
  .input(z.object({ id: z.string() }))
  .handler(({ input }) => {
    assertEntityFeature(input.id, "tags");

    const conn = (db as unknown as { $client: import("better-sqlite3").Database })
      .$client;
    const rows = conn
      .prepare(
        `SELECT t.id, t.name
         FROM entity_tags et
         JOIN tags t ON t.id = et.tag_id
         WHERE et.entity_id = ?
         ORDER BY t.name COLLATE NOCASE ASC`,
      )
      .all(input.id) as Array<{ id: string; name: string }>;

    return { data: rows };
  });

// ---------------------------------------------------------------------------
// add — inline creation with case-insensitive dedup
// ---------------------------------------------------------------------------

export const add = member
  .route({ method: "POST", path: "/entities/{id}/tags" })
  .input(
    z.object({
      id: z.string(),
      name: z
        .string()
        .trim()
        .min(1, "Tag name is required")
        .max(100, "Tag name must be at most 100 characters"),
    }),
  )
  .handler(async ({ context, input }) => {
    assertEntityFeature(input.id, "tags");

    const name = input.name.trim();

    const result = await writeWithDb(
      db,
      context as WriteContext,
      (tx, changes) => {
        const conn = (
          tx as unknown as { $client: import("better-sqlite3").Database }
        ).$client ?? (
          db as unknown as { $client: import("better-sqlite3").Database }
        ).$client;

        // Re-check the entity inside the transaction (D4).
        assertEntityFeature(input.id, "tags");

        // Case-insensitive lookup: reuse the existing tag when present.
        let tagId = findTagIdByName(conn, name);
        let created = false;
        if (!tagId) {
          tagId = randomUUID();
          conn
            .prepare(
              "INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)",
            )
            .run(tagId, name, context.now);
          created = true;
        }

        // Idempotent attach: ignore if already tagged.
        const existing = conn
          .prepare(
            "SELECT 1 FROM entity_tags WHERE entity_id = ? AND tag_id = ?",
          )
          .get(input.id, tagId);
        if (!existing) {
          conn
            .prepare(
              "INSERT INTO entity_tags (entity_id, tag_id) VALUES (?, ?)",
            )
            .run(input.id, tagId);
        }

        // Record the set delta for activity/undo (D12).
        changes.addSetDelta(`tags:${input.id}`, [tagId], []);
        changes.addActivity({
          entityId: input.id,
          action: "tags",
          diff: { sets: { tags: { added: [tagId], removed: [] } } },
        });
        changes.touch(input.id);

        // Return the canonical (stored) tag name.
        const stored = conn
          .prepare("SELECT name FROM tags WHERE id = ?")
          .get(tagId) as { name: string };
        return { tagId, name: stored.name, created };
      },
    );

    return result;
  });

// ---------------------------------------------------------------------------
// remove — detach a tag from an entity
// ---------------------------------------------------------------------------

export const remove = member
  .route({ method: "DELETE", path: "/entities/{id}/tags/{tagId}" })
  .input(z.object({ id: z.string(), tagId: z.string() }))
  .handler(async ({ context, input }) => {
    assertEntityFeature(input.id, "tags");

    await writeWithDb(
      db,
      context as WriteContext,
      (tx, changes) => {
        const conn = (
          tx as unknown as { $client: import("better-sqlite3").Database }
        ).$client ?? (
          db as unknown as { $client: import("better-sqlite3").Database }
        ).$client;

        assertEntityFeature(input.id, "tags");

        const existing = conn
          .prepare(
            "SELECT 1 FROM entity_tags WHERE entity_id = ? AND tag_id = ?",
          )
          .get(input.id, input.tagId);
        if (!existing) {
          throw new ORPCError("conflict", {
            status: ERROR_STATUS_MAP.conflict,
            message: "This tag is not on the entity.",
          });
        }

        conn
          .prepare(
            "DELETE FROM entity_tags WHERE entity_id = ? AND tag_id = ?",
          )
          .run(input.id, input.tagId);

        changes.addSetDelta(`tags:${input.id}`, [], [input.tagId]);
        changes.addActivity({
          entityId: input.id,
          action: "tags",
          diff: { sets: { tags: { added: [], removed: [input.tagId] } } },
        });
        changes.touch(input.id);
      },
    );

    return { ok: true };
  });
