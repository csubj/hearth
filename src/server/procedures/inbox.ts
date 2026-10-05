/**
 * Inbox / bell procedures (task 10.3, design D8).
 *
 * Each member has an inbox of attention items created only by mentions of
 * them, assignment to them, and reminders due for them. The bell shows the
 * unread count (capped display at "9+" in the UI). Members can mark items
 * read, mark all read, and dismiss. Items about trashed entities are hidden.
 *
 *  - list       GET  /inbox            — open items, newest first (paginated)
 *  - count      GET  /inbox/count      — unread open item count (bell)
 *  - markRead   POST /inbox/{id}/read
 *  - markAllRead POST /inbox/read-all
 *  - dismiss    POST /inbox/{id}/dismiss
 */

import "server-only";

import * as z from "zod";
import { ORPCError } from "@orpc/server";

import { member, ERROR_STATUS_MAP } from "../orpc";
import { db } from "../../db";

type Conn = import("better-sqlite3").Database;

interface InboxCursorPayload {
  createdAt: number;
  id: string;
}

function encodeCursor(payload: InboxCursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeCursor(cursor: string): InboxCursorPayload {
  try {
    const raw = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as InboxCursorPayload;
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

// ---------------------------------------------------------------------------
// list — open (not resolved, not dismissed) items for the current member
// ---------------------------------------------------------------------------

export const list = member
  .route({ method: "GET", path: "/inbox" })
  .input(
    z.object({
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional(),
    }),
  )
  .handler(({ context, input }) => {
    const limit = input.limit ?? 50;
    const conn = (db as unknown as { $client: Conn }).$client;

    let cursorPayload: InboxCursorPayload | null = null;
    if (input.cursor) cursorPayload = decodeCursor(input.cursor);

    const whereClauses: string[] = [
      "at.user_id = ?",
      "at.resolved_at IS NULL",
      "at.dismissed_at IS NULL",
      // Items about trashed entities are hidden.
      "e.deleted_at IS NULL",
    ];
    const params: unknown[] = [context.user.id];
    if (cursorPayload) {
      whereClauses.push("(at.created_at < ? OR (at.created_at = ? AND at.id < ?))");
      params.push(cursorPayload.createdAt, cursorPayload.createdAt, cursorPayload.id);
    }
    const whereSQL = whereClauses.join(" AND ");

    const rows = conn
      .prepare(
        `SELECT at.id, at.reason, at.entity_id, at.source_type, at.source_id,
                at.occurrence_key, at.created_at, at.read_at,
                e.title AS entity_title, e.type AS entity_type
         FROM attention at
         JOIN entities e ON e.id = at.entity_id
         WHERE ${whereSQL}
         ORDER BY at.created_at DESC, at.id DESC
         LIMIT ?`,
      )
      .all(...params, limit + 1) as Array<{
      id: string;
      reason: string;
      entity_id: string;
      source_type: string;
      source_id: string;
      occurrence_key: string;
      created_at: number;
      read_at: number | null;
      entity_title: string;
      entity_type: string;
    }>;

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const data = pageRows.map((r) => ({
      id: r.id,
      reason: r.reason,
      entityId: r.entity_id,
      entityTitle: r.entity_title,
      entityType: r.entity_type,
      sourceType: r.source_type,
      sourceId: r.source_id,
      occurrenceKey: r.occurrence_key,
      createdAt: r.created_at,
      readAt: r.read_at,
    }));

    let nextCursor: string | null = null;
    if (hasMore && pageRows.length > 0) {
      const last = pageRows[pageRows.length - 1]!;
      nextCursor = encodeCursor({ createdAt: last.created_at, id: last.id });
    }

    return { data, nextCursor };
  });

// ---------------------------------------------------------------------------
// count — unread open item count (the bell)
// ---------------------------------------------------------------------------

export const count = member
  .route({ method: "GET", path: "/inbox/count" })
  .input(z.object({}))
  .handler(({ context }) => {
    const conn = (db as unknown as { $client: Conn }).$client;
    const row = conn
      .prepare(
        `SELECT COUNT(*) AS c
         FROM attention at
         JOIN entities e ON e.id = at.entity_id
         WHERE at.user_id = ?
           AND at.resolved_at IS NULL
           AND at.dismissed_at IS NULL
           AND at.read_at IS NULL
           AND e.deleted_at IS NULL`,
      )
      .get(context.user.id) as { c: number };
    return { count: row.c };
  });

// ---------------------------------------------------------------------------
// markRead
// ---------------------------------------------------------------------------

export const markRead = member
  .route({ method: "POST", path: "/inbox/{id}/read" })
  .input(z.object({ id: z.string() }))
  .handler(async ({ context, input }) => {
    const conn = (db as unknown as { $client: Conn }).$client;
    const row = conn
      .prepare("SELECT id, read_at FROM attention WHERE id = ? AND user_id = ?")
      .get(input.id, context.user.id) as
      | { id: string; read_at: number | null }
      | undefined;
    if (!row) {
      throw new ORPCError("not_found", {
        status: ERROR_STATUS_MAP.not_found,
        message: "Inbox item not found.",
      });
    }
    if (row.read_at === null) {
      conn
        .prepare("UPDATE attention SET read_at = ? WHERE id = ?")
        .run(context.now, input.id);
    }
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// markAllRead
// ---------------------------------------------------------------------------

export const markAllRead = member
  .route({ method: "POST", path: "/inbox/read-all" })
  .input(z.object({}))
  .handler(({ context }) => {
    const conn = (db as unknown as { $client: Conn }).$client;
    conn
      .prepare(
        `UPDATE attention SET read_at = ?
         WHERE user_id = ? AND read_at IS NULL
           AND resolved_at IS NULL AND dismissed_at IS NULL`,
      )
      .run(context.now, context.user.id);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// dismiss
// ---------------------------------------------------------------------------

export const dismiss = member
  .route({ method: "POST", path: "/inbox/{id}/dismiss" })
  .input(z.object({ id: z.string() }))
  .handler(({ context, input }) => {
    const conn = (db as unknown as { $client: Conn }).$client;
    const row = conn
      .prepare("SELECT id FROM attention WHERE id = ? AND user_id = ?")
      .get(input.id, context.user.id) as { id: string } | undefined;
    if (!row) {
      throw new ORPCError("not_found", {
        status: ERROR_STATUS_MAP.not_found,
        message: "Inbox item not found.",
      });
    }
    conn
      .prepare("UPDATE attention SET dismissed_at = ? WHERE id = ?")
      .run(context.now, input.id);
    return { ok: true };
  });
