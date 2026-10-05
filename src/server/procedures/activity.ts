/**
 * Activity feed and undo procedures (tasks 10.1–10.2, design D8/D12).
 *
 *  - listActivity — GET  /activity (optional entityId) — paginated feed with
 *    actor + channel attribution ("CJ via Claude").
 *  - undo         — POST /activity/{id}/undo — reverses an undoable action.
 *
 * Undo follows the D12 undoable-action table. Every reversal happens inside
 * the write pipeline and is recorded as its own `undo` activity entry whose
 * `undoes_id` points at the entry it undoes; that entry is marked `undone_by_id`
 * so it is never undoable again. The undo entry is itself not undoable (no redo).
 */

import "server-only";

import { randomUUID } from "node:crypto";
import * as z from "zod";
import { ORPCError } from "@orpc/server";

import { member, ERROR_STATUS_MAP } from "../orpc";
import { writeWithDb, type WriteContext } from "../write";
import { db } from "../../db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Conn = import("better-sqlite3").Database;

interface ActivityRow {
  id: string;
  entity_id: string;
  actor_id: string;
  api_key_id: string | null;
  via_label: string | null;
  action: string;
  diff: string;
  created_at: number;
  undoes_id: string | null;
  undone_by_id: string | null;
}

/** Actions that are reversible per the D12 undoable-action table. */
const UNDOABLE_ACTIONS = new Set([
  "create",
  "update",
  "archive",
  "delete",
  "tags",
  "assignees",
  "link",
  "remove-attachment",
  "reminder-complete",
]);

function getConn(tx: unknown): Conn {
  const dbc = db as unknown as { $client: Conn };
  const txc = tx as { $client?: Conn };
  return txc.$client ?? dbc.$client;
}

function viaLabel(ctx: { via: "web" | { name: string | null } }): string | null {
  return typeof ctx.via === "object" ? ctx.via.name : null;
}

function conflict(message: string) {
  return new ORPCError("conflict", {
    status: ERROR_STATUS_MAP.conflict,
    message,
  });
}

// ---------------------------------------------------------------------------
// listActivity — paginated activity feed
// ---------------------------------------------------------------------------

interface ActivityCursorPayload {
  createdAt: number;
  id: string;
}

function encodeActivityCursor(payload: ActivityCursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeActivityCursor(cursor: string): ActivityCursorPayload {
  try {
    const raw = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as ActivityCursorPayload;
    if (typeof raw.id !== "string" || typeof raw.createdAt !== "number") {
      throw new Error("malformed");
    }
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

export const listActivity = member
  .route({ method: "GET", path: "/activity" })
  .input(
    z.object({
      entityId: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional(),
    }),
  )
  .handler(({ input }) => {
    const limit = input.limit ?? 50;
    const conn = (db as unknown as { $client: Conn }).$client;

    let cursorPayload: ActivityCursorPayload | null = null;
    if (input.cursor) cursorPayload = decodeActivityCursor(input.cursor);

    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (input.entityId) {
      whereClauses.push("a.entity_id = ?");
      params.push(input.entityId);
    }
    if (cursorPayload) {
      whereClauses.push(
        "(a.created_at < ? OR (a.created_at = ? AND a.id < ?))",
      );
      params.push(cursorPayload.createdAt, cursorPayload.createdAt, cursorPayload.id);
    }
    const whereSQL =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const rows = conn
      .prepare(
        `SELECT a.id, a.entity_id, a.actor_id, a.api_key_id, a.via_label,
                a.action, a.diff, a.created_at, a.undoes_id, a.undone_by_id,
                e.title AS entity_title, e.type AS entity_type,
                u.name AS actor_name, u.username AS actor_username
         FROM activity a
         JOIN entities e ON e.id = a.entity_id
         JOIN user u ON u.id = a.actor_id
         ${whereSQL}
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT ?`,
      )
      .all(...params, limit + 1) as Array<ActivityRow & {
      entity_title: string;
      entity_type: string;
      actor_name: string | null;
      actor_username: string | null;
    }>;

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const data = pageRows.map((r) => ({
      id: r.id,
      entityId: r.entity_id,
      entityTitle: r.entity_title,
      entityType: r.entity_type,
      action: r.action,
      diff: JSON.parse(r.diff) as Record<string, unknown>,
      actorId: r.actor_id,
      actorName: r.actor_name ?? r.actor_username ?? "Someone",
      actorUsername: r.actor_username,
      viaLabel: r.via_label,
      createdAt: r.created_at,
      // An entry is undoable when it is a reversible action, is not itself an
      // undo (no undoes_id), and has not already been undone (no undone_by_id).
      undoable:
        UNDOABLE_ACTIONS.has(r.action) &&
        r.undoes_id === null &&
        r.undone_by_id === null,
    }));

    let nextCursor: string | null = null;
    if (hasMore && pageRows.length > 0) {
      const last = pageRows[pageRows.length - 1]!;
      nextCursor = encodeActivityCursor({
        createdAt: last.created_at,
        id: last.id,
      });
    }

    return { data, nextCursor };
  });

// ---------------------------------------------------------------------------
// undo — reverse a reversible activity entry (D12)
// ---------------------------------------------------------------------------

export const undo = member
  .route({ method: "POST", path: "/activity/{id}/undo" })
  .input(z.object({ id: z.string() }))
  .handler(async ({ context, input }) => {
    // Load the activity row (read-only) so we can validate before mutating.
    const conn = (db as unknown as { $client: Conn }).$client;
    const entry = conn
      .prepare(
        "SELECT * FROM activity WHERE id = ?",
      )
      .get(input.id) as ActivityRow | undefined;

    if (!entry) {
      throw new ORPCError("not_found", {
        status: ERROR_STATUS_MAP.not_found,
        message: "Activity entry not found.",
      });
    }
    if (entry.undoes_id !== null) {
      throw conflict("This is already an undo and cannot be undone again.");
    }
    if (entry.undone_by_id !== null) {
      throw conflict("This action has already been undone.");
    }
    if (!UNDOABLE_ACTIONS.has(entry.action)) {
      throw conflict(`Action "${entry.action}" is not undoable.`);
    }

    const undoEntryId = randomUUID();
    const diff = JSON.parse(entry.diff) as Record<string, unknown>;

    await writeWithDb(
      db,
      context as WriteContext,
      (tx, changes) => {
        const c = getConn(tx);
        const entityId = entry.entity_id;

        switch (entry.action) {
          case "create":
            undoCreate(c, entityId, context);
            break;
          case "update":
            undoUpdate(c, entityId, diff, context);
            break;
          case "archive":
            undoArchive(c, entityId, context);
            break;
          case "delete":
            undoDelete(c, entityId, context);
            break;
          case "tags":
            undoTags(c, entityId, diff, context);
            break;
          case "assignees":
            undoAssignees(c, entityId, diff, context);
            break;
          case "link":
            undoLink(c, entityId, diff, context);
            break;
          case "remove-attachment":
            undoRemoveAttachment(c, entityId, diff, context);
            break;
          case "reminder-complete":
            undoReminderCompletion(c, entityId, diff, context);
            break;
          default:
            throw conflict(`Action "${entry.action}" is not undoable.`);
        }

        // Record the undo as its own activity entry, and mark the undone
        // entry so it can never be undone again.
        c.prepare(
          `INSERT INTO activity
           (id, entity_id, actor_id, api_key_id, via_label, action, diff, created_at, updated_at, undoes_id)
           VALUES (?, ?, ?, ?, ?, 'undo', ?, ?, ?, ?)`,
        ).run(
          undoEntryId,
          entityId,
          context.user.id,
          typeof context.via === "object" ? context.via.apiKeyId : null,
          viaLabel(context),
          JSON.stringify({ undoes: entry.id, action: entry.action }),
          context.now,
          context.now,
          entry.id,
        );

        c.prepare("UPDATE activity SET undone_by_id = ?, updated_at = ? WHERE id = ?").run(
          undoEntryId,
          context.now,
          entry.id,
        );

        changes.touch(entityId);
      },
    );

    return { ok: true, undoId: undoEntryId };
  });

// ---------------------------------------------------------------------------
// Reversal helpers
// ---------------------------------------------------------------------------

/** Touch an entity's version + updated timestamp (common to every undo). */
function touchEntity(
  c: Conn,
  entityId: string,
  ctx: WriteContext,
): void {
  c.prepare(
    "UPDATE entities SET version = version + 1, updated_by = ?, updated_via = ?, updated_at = ? WHERE id = ?",
  ).run(ctx.user.id, viaLabel(ctx), ctx.now, entityId);
}

function requireEntity(c: Conn, entityId: string): void {
  const row = c.prepare("SELECT id FROM entities WHERE id = ?").get(entityId);
  if (!row) {
    throw new ORPCError("not_found", {
      status: ERROR_STATUS_MAP.not_found,
      message: "Entity not found.",
    });
  }
}

/** Action "create" → trash (refused if already trashed). */
function undoCreate(c: Conn, entityId: string, ctx: WriteContext): void {
  requireEntity(c, entityId);
  const row = c
    .prepare("SELECT deleted_at FROM entities WHERE id = ?")
    .get(entityId) as { deleted_at: number | null };
  if (row.deleted_at !== null) {
    throw conflict("This entity is already in trash.");
  }
  c.prepare(
    "UPDATE entities SET deleted_at = ?, trash_batch_id = ?, updated_by = ?, updated_at = ?, version = version + 1 WHERE id = ?",
  ).run(ctx.now, randomUUID(), ctx.user.id, ctx.now, entityId);
}

/** Action "archive" → unarchive (refused if already undone). */
function undoArchive(c: Conn, entityId: string, ctx: WriteContext): void {
  requireEntity(c, entityId);
  const row = c
    .prepare("SELECT archived_at FROM entities WHERE id = ?")
    .get(entityId) as { archived_at: number | null };
  if (row.archived_at === null) {
    throw conflict("This entity is already unarchived.");
  }
  c.prepare(
    "UPDATE entities SET archived_at = NULL, updated_by = ?, updated_at = ?, version = version + 1 WHERE id = ?",
  ).run(ctx.user.id, ctx.now, entityId);
}

/** Action "delete" → restore (refused if already undone). */
function undoDelete(c: Conn, entityId: string, ctx: WriteContext): void {
  requireEntity(c, entityId);
  const row = c
    .prepare("SELECT deleted_at FROM entities WHERE id = ?")
    .get(entityId) as { deleted_at: number | null };
  if (row.deleted_at === null) {
    throw conflict("This entity is already restored.");
  }
  c.prepare(
    "UPDATE entities SET deleted_at = NULL, trash_batch_id = NULL, updated_by = ?, updated_at = ?, version = version + 1 WHERE id = ?",
  ).run(ctx.user.id, ctx.now, entityId);
}

/**
 * Action "update" → restore `before` values. Refused when a field no longer
 * holds the `after` value the update produced. Notes edits are handled
 * separately (notes diff carries the previous document).
 */
function undoUpdate(
  c: Conn,
  entityId: string,
  diff: Record<string, unknown>,
  ctx: WriteContext,
): void {
  requireEntity(c, entityId);

  // Notes edit (D12): restore the previous document; refused if notes changed.
  const notes = diff.notes as
    | { prevDoc: unknown; prevMarkdown: string | null; version: number }
    | undefined;
  if (notes) {
    const fieldDiffs = (diff.fields ?? {}) as Record<string, [unknown, unknown]>;
    const afterMarkdown = fieldDiffs.notes?.[1] ?? null;
    undoNotes(c, entityId, notes, afterMarkdown, ctx);
    return;
  }

  // Generic field diffs: `{ fields: { field: [before, after] } }` (D12).
  const fields = (diff.fields ?? {}) as Record<string, [unknown, unknown]>;
  const entity = c
    .prepare("SELECT type FROM entities WHERE id = ?")
    .get(entityId) as { type: string };

  for (const [field, [before, after]] of Object.entries(fields)) {
    const current = readField(c, entity.type, entityId, field);
    if (!valuesEqual(current, after)) {
      throw conflict(
        `Field "${field}" no longer holds the value this change set, so it cannot be undone.`,
      );
    }
    writeField(c, entity.type, entityId, field, before);
  }
  touchEntity(c, entityId, ctx);
}

/**
 * Notes edit undo. `prevDoc` is the full ProseMirror document before the edit;
 * `afterMarkdown` is the markdown the edit produced. Refused when the current
 * notes markdown differs from `afterMarkdown` (i.e. notes changed since).
 */
function undoNotes(
  c: Conn,
  entityId: string,
  notes: { prevDoc: unknown; prevMarkdown: string | null; version: number },
  afterMarkdown: unknown,
  ctx: WriteContext,
): void {
  const current = c
    .prepare("SELECT doc, markdown, version FROM notes WHERE entity_id = ?")
    .get(entityId) as
    | { doc: string; markdown: string; version: number }
    | undefined;

  if (!current) {
    throw conflict("Notes are missing.");
  }
  // Refused when notes changed since this edit (D12). Robust across coalescing:
  // if any later edit changed the notes, the current markdown no longer equals
  // the markdown this edit produced.
  if (!valuesEqual(current.markdown, afterMarkdown)) {
    throw conflict("Notes have changed since this edit; cannot undo.");
  }

  const doc = notes.prevDoc ? JSON.stringify(notes.prevDoc) : "null";
  const markdown = notes.prevMarkdown ?? "";
  const newVersion = current.version + 1;
  c.prepare(
    "UPDATE notes SET doc = ?, markdown = ?, version = ?, updated_by = ?, updated_at = ? WHERE entity_id = ?",
  ).run(doc, markdown, newVersion, ctx.user.id, ctx.now, entityId);
  touchEntity(c, entityId, ctx);
}

/**
 * Action "tags" → reverse each added/removed item. Items already reverted are
 * skipped (idempotent).
 */
function undoTags(
  c: Conn,
  entityId: string,
  diff: Record<string, unknown>,
  ctx: WriteContext,
): void {
  requireEntity(c, entityId);
  const sets = (diff.sets ?? {}) as Record<
    string,
    { added: string[]; removed: string[] }
  >;
  const delta = sets.tags ?? { added: [], removed: [] };

  for (const tagId of delta.added) {
    c.prepare("DELETE FROM entity_tags WHERE entity_id = ? AND tag_id = ?").run(
      entityId,
      tagId,
    );
  }
  for (const tagId of delta.removed) {
    // Skip if the tag no longer exists.
    const tag = c.prepare("SELECT id FROM tags WHERE id = ?").get(tagId);
    if (!tag) continue;
    const exists = c
      .prepare("SELECT 1 FROM entity_tags WHERE entity_id = ? AND tag_id = ?")
      .get(entityId, tagId);
    if (!exists) {
      c.prepare("INSERT INTO entity_tags (entity_id, tag_id) VALUES (?, ?)").run(
        entityId,
        tagId,
      );
    }
  }
  touchEntity(c, entityId, ctx);
}

/** Action "assignees" → reverse each added/removed assignee. */
function undoAssignees(
  c: Conn,
  entityId: string,
  diff: Record<string, unknown>,
  ctx: WriteContext,
): void {
  requireEntity(c, entityId);
  const sets = (diff.sets ?? {}) as Record<
    string,
    { added: string[]; removed: string[] }
  >;
  const delta = sets.assignees ?? { added: [], removed: [] };

  for (const userId of delta.added) {
    c.prepare("DELETE FROM entity_assignees WHERE entity_id = ? AND user_id = ?").run(
      entityId,
      userId,
    );
  }
  for (const userId of delta.removed) {
    const exists = c
      .prepare("SELECT 1 FROM entity_assignees WHERE entity_id = ? AND user_id = ?")
      .get(entityId, userId);
    if (!exists) {
      c.prepare("INSERT INTO entity_assignees (entity_id, user_id) VALUES (?, ?)").run(
        entityId,
        userId,
      );
    }
  }
  touchEntity(c, entityId, ctx);
}

/** Action "link" → reverse each added/removed `${toId}:${relation}` item. */
function undoLink(
  c: Conn,
  entityId: string,
  diff: Record<string, unknown>,
  ctx: WriteContext,
): void {
  requireEntity(c, entityId);
  const sets = (diff.sets ?? {}) as Record<
    string,
    { added: string[]; removed: string[] }
  >;
  const delta = sets.links ?? { added: [], removed: [] };

  // For each item "toId:relation", delete the matching link row.
  for (const item of delta.added) {
    const [toId, relation] = splitLinkItem(item);
    c.prepare(
      `DELETE FROM entity_links
       WHERE relation = ? AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))`,
    ).run(relation, entityId, toId, toId, entityId);
  }

  // For removed items, re-add the link (normalize `related` pairs).
  for (const item of delta.removed) {
    const [toId, relation] = splitLinkItem(item);
    const [fromId, toIdNorm] =
      relation === "related" && entityId > toId
        ? [toId, entityId]
        : [entityId, toId];
    const exists = c
      .prepare("SELECT 1 FROM entity_links WHERE from_id = ? AND to_id = ? AND relation = ?")
      .get(fromId, toIdNorm, relation);
    if (!exists) {
      c.prepare(
        "INSERT INTO entity_links (id, from_id, to_id, relation, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(randomUUID(), fromId, toIdNorm, relation, ctx.user.id, ctx.now);
    }
  }
  touchEntity(c, entityId, ctx);
}

/**
 * Action "reminder" (reminder completion) → restore the previous due date and
 * completion (D12). Refused with `conflict` when the reminder changed since
 * the completion, i.e. any of the values the completion set no longer hold
 * their `after` value.
 */
function undoReminderCompletion(
  c: Conn,
  entityId: string,
  diff: Record<string, unknown>,
  ctx: WriteContext,
): void {
  requireEntity(c, entityId);
  const r = diff.reminder as
    | {
        reminderId: string;
        prevDueOn: string | null;
        newDueOn: string | null;
        prevClosedAt: number | null;
        newClosedAt: number | null;
        prevLastCompletedAt: number | null;
        newLastCompletedAt: number | null;
        prevLastCompletedBy: string | null;
        newLastCompletedBy: string | null;
        removed?: boolean;
      }
    | undefined;

  if (!r || !r.reminderId) {
    throw conflict("Reminder id is missing from this change.");
  }
  if (r.removed) {
    throw conflict("This reminder was deleted; it cannot be undone.");
  }

  const row = c
    .prepare("SELECT * FROM reminders WHERE id = ? AND entity_id = ?")
    .get(r.reminderId, entityId) as
    | {
        due_on: string;
        closed_at: number | null;
        last_completed_at: number | null;
        last_completed_by: string | null;
      }
    | undefined;

  if (!row) {
    throw conflict("This reminder no longer exists.");
  }

  // Refused when the reminder changed since the completion (D12): the
  // completion set due_on / closed_at / last_completed_* and those must still
  // hold the after values for the undo to be safe.
  const changedSince =
    row.due_on !== r.newDueOn ||
    row.closed_at !== r.newClosedAt ||
    row.last_completed_at !== r.newLastCompletedAt ||
    row.last_completed_by !== r.newLastCompletedBy;
  if (changedSince) {
    throw conflict("Reminder changed since it was completed; cannot undo.");
  }

  c.prepare(
    `UPDATE reminders SET due_on = ?, closed_at = ?, last_completed_at = ?,
     last_completed_by = ? WHERE id = ?`,
  ).run(
    r.prevDueOn ?? null,
    r.prevClosedAt ?? null,
    r.prevLastCompletedAt ?? null,
    r.prevLastCompletedBy ?? null,
    r.reminderId,
  );
  touchEntity(c, entityId, ctx);
}

/** Action "remove-attachment" → restore the attachment (refused if purged). */
function undoRemoveAttachment(
  c: Conn,
  entityId: string,
  diff: Record<string, unknown>,
  ctx: WriteContext,
): void {
  requireEntity(c, entityId);
  const attachmentId = (diff.attachmentId as [string, unknown] | undefined)?.[0];
  if (!attachmentId) {
    throw conflict("Attachment id is missing from this change.");
  }
  const row = c
    .prepare("SELECT id FROM attachments WHERE id = ? AND entity_id = ?")
    .get(attachmentId, entityId) as { id: string } | undefined;
  if (!row) {
    // Purged (row removed) — cannot restore.
    throw conflict("This attachment has been purged and can no longer be restored.");
  }
  c.prepare("UPDATE attachments SET deleted_at = NULL WHERE id = ?").run(attachmentId);
  touchEntity(c, entityId, ctx);
}

// ---------------------------------------------------------------------------
// Field read/write for generic module updates
// ---------------------------------------------------------------------------

function snakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function detailsTableName(type: string): string {
  return snakeCase(type) + "_details";
}

/** Read the current value of a module field (entities vs details table). */
function readField(
  c: Conn,
  type: string,
  entityId: string,
  field: string,
): unknown {
  if (field === "title") {
    const row = c.prepare("SELECT title FROM entities WHERE id = ?").get(entityId) as {
      title: string;
    };
    return row?.title ?? null;
  }
  if (field === "placeId") {
    const row = c.prepare("SELECT place_id FROM entities WHERE id = ?").get(entityId) as {
      place_id: string | null;
    };
    return row?.place_id ?? null;
  }
  const col = snakeCase(field);
  const row = c
    .prepare(`SELECT ${col} AS v FROM ${detailsTableName(type)} WHERE entity_id = ?`)
    .get(entityId) as { v: unknown };
  return row ? row.v : null;
}

/** Write a module field value back (entities vs details table). */
function writeField(
  c: Conn,
  type: string,
  entityId: string,
  field: string,
  value: unknown,
): void {
  if (field === "title") {
    c.prepare("UPDATE entities SET title = ? WHERE id = ?").run(
      value ?? "",
      entityId,
    );
    return;
  }
  if (field === "placeId") {
    c.prepare("UPDATE entities SET place_id = ? WHERE id = ?").run(
      value ?? null,
      entityId,
    );
    return;
  }
  const col = snakeCase(field);
  c.prepare(`UPDATE ${detailsTableName(type)} SET ${col} = ? WHERE entity_id = ?`).run(
    value ?? null,
    entityId,
  );
}

/** Shallow equality that treats undefined/null as equal. */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  return a === b;
}

function splitLinkItem(item: string): [string, string] {
  const idx = item.lastIndexOf(":");
  return [item.slice(0, idx), item.slice(idx + 1)];
}
