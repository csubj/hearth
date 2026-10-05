/**
 * Pins procedures (task 13.4, design D8).
 *
 * A member can pin entities so they appear in the "Pinned" section of their
 * Today page. Pins are per-user: pinning an entity only affects the member
 * who pinned it.
 *
 *  - pin        POST   /entities/{id}/pin        — pin an entity for me
 *  - unpin      POST   /entities/{id}/unpin      — remove my pin
 *  - listPinned GET    /entities/pinned          — my pinned entities
 *  - isPinned   GET    /entities/{id}/is-pinned  — whether I have pinned it
 */

import "server-only";

import * as z from "zod";
import { ORPCError } from "@orpc/server";

import { member, ERROR_STATUS_MAP } from "../orpc";
import { db } from "../../db";
import { pins } from "../../db/schema";

type Conn = import("better-sqlite3").Database;

function getConn(): Conn {
  return (db as unknown as { $client: Conn }).$client;
}

/** Ensure the target entity exists and is not trashed. */
function assertEntityExists(conn: Conn, entityId: string): void {
  const row = conn
    .prepare(
      "SELECT id FROM entities WHERE id = ? AND deleted_at IS NULL",
    )
    .get(entityId) as { id: string } | undefined;
  if (!row) {
    throw new ORPCError("not_found", {
      status: ERROR_STATUS_MAP.not_found,
      message: "Entity not found.",
    });
  }
}

// ---------------------------------------------------------------------------
// pin
// ---------------------------------------------------------------------------

export const pin = member
  .route({ method: "POST", path: "/entities/{id}/pin" })
  .input(z.object({ id: z.string() }))
  .handler(({ context, input }) => {
    const conn = getConn();
    assertEntityExists(conn, input.id);
    conn
      .prepare(
        "INSERT OR IGNORE INTO pins (user_id, entity_id) VALUES (?, ?)",
      )
      .run(context.user.id, input.id);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// unpin
// ---------------------------------------------------------------------------

export const unpin = member
  .route({ method: "POST", path: "/entities/{id}/unpin" })
  .input(z.object({ id: z.string() }))
  .handler(({ context, input }) => {
    const conn = getConn();
    conn
      .prepare("DELETE FROM pins WHERE user_id = ? AND entity_id = ?")
      .run(context.user.id, input.id);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// listPinned — my pinned entities (most recently pinned first, no dupes)
// ---------------------------------------------------------------------------

export const listPinned = member
  .route({ method: "GET", path: "/entities/pinned" })
  .input(z.object({}))
  .handler(({ context }) => {
    const conn = getConn();
    const rows = conn
      .prepare(
        `SELECT e.id, e.type, e.title, e.place_id, e.updated_at
         FROM pins p
         JOIN entities e ON e.id = p.entity_id
         WHERE p.user_id = ? AND e.deleted_at IS NULL
         ORDER BY e.updated_at DESC, e.id DESC`,
      )
      .all(context.user.id) as Array<{
      id: string;
      type: string;
      title: string;
      place_id: string | null;
      updated_at: number;
    }>;
    return {
      data: rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        placeId: r.place_id,
        updatedAt: r.updated_at,
      })),
    };
  });

// ---------------------------------------------------------------------------
// isPinned — whether the current member has pinned this entity
// ---------------------------------------------------------------------------

export const isPinned = member
  .route({ method: "GET", path: "/entities/{id}/is-pinned" })
  .input(z.object({ id: z.string() }))
  .handler(({ context, input }) => {
    const conn = getConn();
    const row = conn
      .prepare(
        "SELECT 1 AS x FROM pins WHERE user_id = ? AND entity_id = ?",
      )
      .get(context.user.id, input.id) as { x: number } | undefined;
    return { pinned: !!row };
  });
