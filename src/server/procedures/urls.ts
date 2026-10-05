/**
 * External URL procedures (task 8.3, design D8).
 *
 * Entities support a list of labeled external URLs, rendered with
 * `target=_blank` and `rel=noopener` in the UI.
 *
 *  list   GET  /entities/{id}/urls
 *  add    POST /entities/{id}/urls   — body { label, url }
 *  remove DELETE /entities/{id}/urls/{urlId}
 */

import "server-only";

import { randomUUID } from "node:crypto";
import * as z from "zod";
import { ORPCError } from "@orpc/server";

import { member, ERROR_STATUS_MAP } from "../orpc";
import { writeWithDb, type WriteContext } from "../write";
import { assertEntityLive } from "../entity-feature";
import { db } from "../../db";

const URL_SCHEMA = z
  .string()
  .url("Must be a valid URL")
  .max(2048, "URL must be at most 2048 characters")
  .refine(
    (u) => /^https?:\/\//i.test(u),
    "URL must start with http:// or https://",
  );

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

export const list = member
  .route({ method: "GET", path: "/entities/{id}/urls" })
  .input(z.object({ id: z.string() }))
  .handler(({ input }) => {
    assertEntityLive(input.id);

    const conn = (db as unknown as { $client: import("better-sqlite3").Database })
      .$client;
    const rows = conn
      .prepare(
        `SELECT id, label, url FROM entity_urls
         WHERE entity_id = ?
         ORDER BY created_at ASC`,
      )
      .all(input.id) as Array<{ id: string; label: string; url: string }>;

    return {
      data: rows.map((r) => ({ id: r.id, label: r.label, url: r.url })),
    };
  });

// ---------------------------------------------------------------------------
// add
// ---------------------------------------------------------------------------

export const add = member
  .route({ method: "POST", path: "/entities/{id}/urls" })
  .input(
    z.object({
      id: z.string(),
      label: z
        .string()
        .trim()
        .min(1, "Label is required")
        .max(200, "Label must be at most 200 characters"),
      url: URL_SCHEMA,
    }),
  )
  .handler(async ({ context, input }) => {
    assertEntityLive(input.id);

    const urlId = randomUUID();

    await writeWithDb(
      db,
      context as WriteContext,
      (tx, changes) => {
        const conn = (
          tx as unknown as { $client: import("better-sqlite3").Database }
        ).$client ?? (
          db as unknown as { $client: import("better-sqlite3").Database }
        ).$client;

        assertEntityLive(input.id);

        conn
          .prepare(
            "INSERT INTO entity_urls (id, entity_id, label, url, created_at) VALUES (?, ?, ?, ?, ?)",
          )
          .run(urlId, input.id, input.label.trim(), input.url, context.now);

        changes.touch(input.id);
      },
    );

    return { id: urlId };
  });

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

export const remove = member
  .route({ method: "DELETE", path: "/entities/{id}/urls/{urlId}" })
  .input(z.object({ id: z.string(), urlId: z.string() }))
  .handler(async ({ context, input }) => {
    assertEntityLive(input.id);

    await writeWithDb(
      db,
      context as WriteContext,
      (tx, changes) => {
        const conn = (
          tx as unknown as { $client: import("better-sqlite3").Database }
        ).$client ?? (
          db as unknown as { $client: import("better-sqlite3").Database }
        ).$client;

        assertEntityLive(input.id);

        const existing = conn
          .prepare(
            "SELECT 1 FROM entity_urls WHERE id = ? AND entity_id = ?",
          )
          .get(input.urlId, input.id);
        if (!existing) {
          throw new ORPCError("not_found", {
            status: ERROR_STATUS_MAP.not_found,
            message: "URL not found.",
          });
        }

        conn
          .prepare("DELETE FROM entity_urls WHERE id = ? AND entity_id = ?")
          .run(input.urlId, input.id);

        changes.touch(input.id);
      },
    );

    return { ok: true };
  });
