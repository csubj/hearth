/**
 * Collaboration procedures (tasks 9.1–9.5, design D8/D9/D13).
 *
 * Shared rich-text value for notes and comments, plus multiple assignees.
 * Every mutation goes through the write pipeline; authorization lives in the
 * middleware plus handler-side checks for "own or admin" comment edits/deletes.
 *
 *  - Notes:  GET/POST  /entities/{id}/notes
 *  - Comments: GET /entities/{id}/comments, POST /entities/{id}/comments,
 *              POST /entities/{id}/comments/{commentId}, DELETE /entities/{id}/comments/{commentId}
 *  - Assignees: GET /entities/{id}/assignees, POST /entities/{id}/assignees,
 *               DELETE /entities/{id}/assignees/{userId}
 */

import "server-only";

import { randomUUID } from "node:crypto";
import * as z from "zod";
import { ORPCError } from "@orpc/server";

import { member, ERROR_STATUS_MAP } from "../orpc";
import { writeWithDb, type WriteContext } from "../write";
import { assertEntityFeature } from "../entity-feature";
import { listActiveMembers, memberByUsername } from "../members";
import { db } from "../../db";
import {
  buildRichText,
  RichTextSizeError,
  type RichTextValue,
} from "../../lib/richtext";
import type { AppContext } from "../context";

// ---------------------------------------------------------------------------
// Limits (design D9 / service-api spec)
// ---------------------------------------------------------------------------

export const NOTES_LIMIT = 500 * 1024; // 500 KB
export const COMMENTS_LIMIT = 20 * 1024; // 20 KB

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const richTextField = z
  .object({
    doc: z.unknown().optional(),
    markdown: z.string().optional(),
  })
  .refine((v) => (v.doc !== undefined) !== (v.markdown !== undefined), {
    message: "Provide exactly one of doc or markdown.",
  });

const notesInput = z.object({
  id: z.string(),
  expectedVersion: z.number().int().optional(),
  doc: z.unknown().optional(),
  markdown: z.string().optional(),
});

const commentCreateInput = z.object({
  id: z.string(),
  doc: z.unknown().optional(),
  markdown: z.string().optional(),
});

const commentEditInput = z.object({
  id: z.string(),
  commentId: z.string(),
  doc: z.unknown().optional(),
  markdown: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Conn = import("better-sqlite3").Database;

function getConn(tx: unknown): Conn {
  const dbc = db as unknown as { $client: Conn };
  const txc = tx as { $client?: Conn };
  return txc.$client ?? dbc.$client;
}

function validationError(msg: string, path: string) {
  return new ORPCError("validation_error", {
    status: ERROR_STATUS_MAP.validation_error,
    message: msg,
    data: { details: [{ path, message: msg }] },
  });
}

function buildValue(
  input: { doc?: unknown; markdown?: string },
  limit: number,
  members: Map<string, string>,
): RichTextValue {
  try {
    return buildRichText(
      { doc: input.doc, markdown: input.markdown },
      { limit, members },
    );
  } catch (err) {
    if (err instanceof RichTextSizeError) {
      throw validationError(err.message, "body");
    }
    throw err;
  }
}

/**
 * Diff the mention set for a source before/after a save and record the new
 * set. New mentions (user ids not already present) each create one attention
 * item keyed `mention:<sourceType>:<sourceId>:<userId>:<writeId>` (D8).
 */
function syncMentions(
  conn: Conn,
  sourceType: "note" | "comment",
  sourceId: string,
  newIds: string[],
  entityId: string,
  writeId: string,
  changes: {
    addAttention: (item: {
      userId: string;
      reason: string;
      entityId: string;
      sourceType: string;
      sourceId: string;
      occurrenceKey: string;
    }) => void;
  },
): void {
  const existing = conn
    .prepare(
      "SELECT user_id FROM mentions WHERE source_type = ? AND source_id = ?",
    )
    .all(sourceType, sourceId) as Array<{ user_id: string }>;
  const existingSet = new Set(existing.map((r) => r.user_id));

  const added = newIds.filter((id) => !existingSet.has(id));
  for (const userId of added) {
    changes.addAttention({
      userId,
      reason: "mention",
      entityId,
      sourceType,
      sourceId,
      occurrenceKey: `mention:${sourceType}:${sourceId}:${userId}:${writeId}`,
    });
  }

  // Replace the stored mention set.
  conn
    .prepare("DELETE FROM mentions WHERE source_type = ? AND source_id = ?")
    .run(sourceType, sourceId);
  const insert = conn.prepare(
    "INSERT INTO mentions (source_type, source_id, user_id) VALUES (?, ?, ?)",
  );
  for (const userId of newIds) insert.run(sourceType, sourceId, userId);
}

function viaLabel(ctx: AppContext): string | null {
  return typeof ctx.via === "object" ? ctx.via.name : null;
}

// ---------------------------------------------------------------------------
// 9.2 Notes
// ---------------------------------------------------------------------------

export const getNotes = member
  .route({ method: "GET", path: "/entities/{id}/notes" })
  .input(z.object({ id: z.string() }))
  .handler(({ input }) => {
    assertEntityFeature(input.id, "notes");
    const conn = (db as unknown as { $client: Conn }).$client;
    const row = conn
      .prepare(
        "SELECT doc, markdown, version, updated_by, updated_at FROM notes WHERE entity_id = ?",
      )
      .get(input.id) as
      | { doc: string; markdown: string; version: number; updated_by: string; updated_at: number }
      | undefined;

    if (!row) {
      return { version: 0, doc: null, markdown: "", updatedBy: null, updatedAt: null };
    }
    return {
      version: row.version,
      doc: JSON.parse(row.doc),
      markdown: row.markdown,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
    };
  });

export const saveNotes = member
  .route({ method: "POST", path: "/entities/{id}/notes" })
  .input(notesInput)
  .handler(async ({ context, input }) => {
    assertEntityFeature(input.id, "notes");
    const writeId = randomUUID();
    const value = buildValue(input, NOTES_LIMIT, memberByUsername());

    const result = await writeWithDb(
      db,
      context as WriteContext,
      (tx, changes) => {
        const conn = getConn(tx);
        assertEntityFeature(input.id, "notes");

        const current = conn
          .prepare(
            "SELECT version, doc, markdown FROM notes WHERE entity_id = ?",
          )
          .get(input.id) as
          | { version: number; doc: string; markdown: string }
          | undefined;
        const currentVersion = current?.version ?? 0;

        if (
          input.expectedVersion !== undefined &&
          input.expectedVersion !== currentVersion
        ) {
          throw new ORPCError("conflict", {
            status: ERROR_STATUS_MAP.conflict,
            message: "Notes have been modified. Refresh and retry.",
            data: { currentVersion },
          });
        }

        const newVersion = currentVersion + 1;
        if (current) {
          conn
            .prepare(
              "UPDATE notes SET doc = ?, markdown = ?, version = ?, updated_by = ?, updated_at = ? WHERE entity_id = ?",
            )
            .run(
              JSON.stringify(value.doc),
              value.markdown,
              newVersion,
              context.user.id,
              context.now,
              input.id,
            );
        } else {
          conn
            .prepare(
              "INSERT INTO notes (entity_id, doc, markdown, version, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .run(
              input.id,
              JSON.stringify(value.doc),
              value.markdown,
              newVersion,
              context.user.id,
              context.now,
            );
        }

        conn
          .prepare(
            "UPDATE entities SET updated_by = ?, updated_via = ?, updated_at = ? WHERE id = ?",
          )
          .run(context.user.id, viaLabel(context), context.now, input.id);

        changes.touch(input.id);
        changes.recordNotesRevision(
          input.id,
          current ? JSON.parse(current.doc) : null,
          value.doc,
        );
        changes.addActivity({
          entityId: input.id,
          action: "update",
          diff: {
            fields: { notes: [current?.markdown ?? null, value.markdown] },
            // Carry the previous document and resulting version so undo can
            // restore it (D12) and refuse when notes changed since.
            notes: {
              prevDoc: current ? JSON.parse(current.doc) : null,
              prevMarkdown: current?.markdown ?? null,
              version: newVersion,
            },
          },
        });

        syncMentions(conn, "note", input.id, value.mentionIds, input.id, writeId, changes);

        return { version: newVersion };
      },
    );

    return {
      version: result.version,
      doc: value.doc,
      markdown: value.markdown,
      mentionIds: value.mentionIds,
    };
  });

// ---------------------------------------------------------------------------
// 9.3 Comments
// ---------------------------------------------------------------------------

export const listComments = member
  .route({ method: "GET", path: "/entities/{id}/comments" })
  .input(z.object({ id: z.string() }))
  .handler(({ input }) => {
    assertEntityFeature(input.id, "comments");
    const conn = (db as unknown as { $client: Conn }).$client;
    const rows = conn
      .prepare(
        `SELECT id, author_id, doc, markdown, edited_at, created_at
         FROM comments WHERE entity_id = ? ORDER BY created_at ASC`,
      )
      .all(input.id) as Array<{
      id: string;
      author_id: string;
      doc: string;
      markdown: string;
      edited_at: number | null;
      created_at: number;
    }>;

    const data = rows.map((r) => ({
      id: r.id,
      authorId: r.author_id,
      doc: JSON.parse(r.doc),
      markdown: r.markdown,
      editedAt: r.edited_at,
      createdAt: r.created_at,
    }));
    return { data };
  });

export const createComment = member
  .route({ method: "POST", path: "/entities/{id}/comments" })
  .input(commentCreateInput)
  .handler(async ({ context, input }) => {
    assertEntityFeature(input.id, "comments");
    const writeId = randomUUID();
    const commentId = randomUUID();
    const value = buildValue(input, COMMENTS_LIMIT, memberByUsername());

    await writeWithDb(
      db,
      context as WriteContext,
      (tx, changes) => {
        const conn = getConn(tx);
        assertEntityFeature(input.id, "comments");
        conn
          .prepare(
            "INSERT INTO comments (id, entity_id, author_id, doc, markdown, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .run(
            commentId,
            input.id,
            context.user.id,
            JSON.stringify(value.doc),
            value.markdown,
            context.now,
          );
        changes.touch(input.id);
        changes.addActivity({
          entityId: input.id,
          action: "comment",
          diff: { fields: { comment: [null, value.markdown] } },
        });
        syncMentions(conn, "comment", commentId, value.mentionIds, input.id, writeId, changes);
      },
    );

    return {
      id: commentId,
      authorId: context.user.id,
      doc: value.doc,
      markdown: value.markdown,
      editedAt: null,
      createdAt: context.now,
    };
  });

export const editComment = member
  .route({ method: "POST", path: "/entities/{id}/comments/{commentId}" })
  .input(commentEditInput)
  .handler(async ({ context, input }) => {
    assertEntityFeature(input.id, "comments");
    const writeId = randomUUID();
    const value = buildValue(input, COMMENTS_LIMIT, memberByUsername());

    await writeWithDb(
      db,
      context as WriteContext,
      (tx, changes) => {
        const conn = getConn(tx);
        assertEntityFeature(input.id, "comments");
        const row = conn
          .prepare("SELECT author_id FROM comments WHERE id = ? AND entity_id = ?")
          .get(input.commentId, input.id) as { author_id: string } | undefined;
        if (!row) {
          throw new ORPCError("not_found", {
            status: ERROR_STATUS_MAP.not_found,
            message: "Comment not found.",
          });
        }
        if (row.author_id !== context.user.id) {
          throw new ORPCError("forbidden", {
            status: ERROR_STATUS_MAP.forbidden,
            message: "You can only edit your own comments.",
          });
        }
        conn
          .prepare(
            "UPDATE comments SET doc = ?, markdown = ?, edited_at = ? WHERE id = ?",
          )
          .run(
            JSON.stringify(value.doc),
            value.markdown,
            context.now,
            input.commentId,
          );
        changes.touch(input.id);
        changes.addActivity({
          entityId: input.id,
          action: "comment",
          diff: { fields: { comment: [undefined, value.markdown] } },
        });
        syncMentions(conn, "comment", input.commentId, value.mentionIds, input.id, writeId, changes);
      },
    );

    return { id: input.commentId, ok: true };
  });

export const deleteComment = member
  .route({ method: "DELETE", path: "/entities/{id}/comments/{commentId}" })
  .input(z.object({ id: z.string(), commentId: z.string() }))
  .handler(async ({ context, input }) => {
    assertEntityFeature(input.id, "comments");

    await writeWithDb(
      db,
      context as WriteContext,
      (tx, changes) => {
        const conn = getConn(tx);
        assertEntityFeature(input.id, "comments");
        const row = conn
          .prepare("SELECT author_id FROM comments WHERE id = ? AND entity_id = ?")
          .get(input.commentId, input.id) as { author_id: string } | undefined;
        if (!row) {
          throw new ORPCError("not_found", {
            status: ERROR_STATUS_MAP.not_found,
            message: "Comment not found.",
          });
        }
        const isAuthor = row.author_id === context.user.id;
        const isAdmin = context.user.role === "admin";
        if (!isAuthor && !isAdmin) {
          throw new ORPCError("forbidden", {
            status: ERROR_STATUS_MAP.forbidden,
            message: "You can only delete your own comments.",
          });
        }
        conn.prepare("DELETE FROM comments WHERE id = ?").run(input.commentId);
        conn
          .prepare("DELETE FROM mentions WHERE source_type = 'comment' AND source_id = ?")
          .run(input.commentId);
        changes.touch(input.id);
        changes.addActivity({
          entityId: input.id,
          action: "comment",
          diff: { fields: { comment: [null, null] } },
        });
      },
    );

    return { ok: true };
  });

// ---------------------------------------------------------------------------
// 9.5 Assignees
// ---------------------------------------------------------------------------

/** Active household members, for the assignee picker and mention UI. */
export const listMembers = member
  .route({ method: "GET", path: "/members" })
  .input(z.object({}))
  .handler(() => {
    const rows = listActiveMembers();
    return { data: rows.map((m) => ({ id: m.id, username: m.username, name: m.name })) };
  });

export const listAssignees = member
  .route({ method: "GET", path: "/entities/{id}/assignees" })
  .input(z.object({ id: z.string() }))
  .handler(({ input }) => {
    assertEntityFeature(input.id, "assignees");
    const conn = (db as unknown as { $client: Conn }).$client;
    const rows = conn
      .prepare(
        `SELECT u.id, u.username, u.name
         FROM entity_assignees ea
         JOIN user u ON u.id = ea.user_id
         WHERE ea.entity_id = ? AND u.banned = 0
         ORDER BY u.name COLLATE NOCASE ASC`,
      )
      .all(input.id) as Array<{ id: string; username: string; name: string }>;
    return { data: rows };
  });

export const addAssignee = member
  .route({ method: "POST", path: "/entities/{id}/assignees" })
  .input(z.object({ id: z.string(), userId: z.string() }))
  .handler(async ({ context, input }) => {
    assertEntityFeature(input.id, "assignees");
    const writeId = randomUUID();
    const selfAssign = input.userId === context.user.id;

    const result = await writeWithDb(
      db,
      context as WriteContext,
      (tx, changes) => {
        const conn = getConn(tx);
        assertEntityFeature(input.id, "assignees");

        const member = conn
          .prepare("SELECT id FROM user WHERE id = ? AND banned = 0")
          .get(input.userId) as { id: string } | undefined;
        if (!member) {
          throw validationError("Not an active member.", "userId");
        }

        const existing = conn
          .prepare("SELECT 1 FROM entity_assignees WHERE entity_id = ? AND user_id = ?")
          .get(input.id, input.userId);
        if (!existing) {
          conn
            .prepare("INSERT INTO entity_assignees (entity_id, user_id) VALUES (?, ?)")
            .run(input.id, input.userId);
          changes.addSetDelta(`assignees:${input.id}`, [input.userId], []);
          changes.addActivity({
            entityId: input.id,
            action: "assignees",
            diff: { sets: { assignees: { added: [input.userId], removed: [] } } },
          });
          if (!selfAssign) {
            changes.addAttention({
              userId: input.userId,
              reason: "assigned",
              entityId: input.id,
              sourceType: "entity",
              sourceId: input.id,
              occurrenceKey: `assigned:${input.id}:${input.userId}:${writeId}`,
            });
          }
          changes.touch(input.id);
        }
      },
    );

    return { ok: true, added: !selfAssign };
  });

export const removeAssignee = member
  .route({ method: "DELETE", path: "/entities/{id}/assignees/{userId}" })
  .input(z.object({ id: z.string(), userId: z.string() }))
  .handler(async ({ context, input }) => {
    assertEntityFeature(input.id, "assignees");

    await writeWithDb(
      db,
      context as WriteContext,
      (tx, changes) => {
        const conn = getConn(tx);
        assertEntityFeature(input.id, "assignees");
        const existing = conn
          .prepare("SELECT 1 FROM entity_assignees WHERE entity_id = ? AND user_id = ?")
          .get(input.id, input.userId);
        if (!existing) {
          throw new ORPCError("conflict", {
            status: ERROR_STATUS_MAP.conflict,
            message: "This member is not assigned.",
          });
        }
        conn
          .prepare("DELETE FROM entity_assignees WHERE entity_id = ? AND user_id = ?")
          .run(input.id, input.userId);
        changes.addSetDelta(`assignees:${input.id}`, [], [input.userId]);
        changes.addActivity({
          entityId: input.id,
          action: "assignees",
          diff: { sets: { assignees: { added: [], removed: [input.userId] } } },
        });
        changes.touch(input.id);
      },
    );

    return { ok: true };
  });
