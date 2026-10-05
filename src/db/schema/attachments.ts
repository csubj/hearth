import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { entities } from "./entities";
import { user } from "./auth";

/** Milliseconds-since-epoch timestamp (consistent with the entities schema). */
const tsMs = { mode: "timestamp_ms" } as const;

/**
 * attachments — uploaded files attached to an entity (design D8, task 8.4).
 *
 * The table is created alongside the trash/purge infrastructure (task 6.7)
 * because permanent purge must unlink attachment files after commit. The
 * upload/serving procedures are added in task 8.4.
 */
export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    /** Owning entity. ON DELETE CASCADE so purging the entity removes the row. */
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    /** Original file name (display only). */
    filename: text("filename").notNull(),
    /** Sniffed MIME type. */
    mime: text("mime").notNull(),
    /** Size in bytes. */
    size: integer("size").notNull(),
    /** Storage key (filename) within the uploads directory. */
    storageKey: text("storage_key").notNull(),
    /** Whether a thumbnail exists. */
    hasThumb: integer("has_thumb", { mode: "boolean" })
      .notNull()
      .default(false),
    /** Uploader (users are disabled, never deleted). */
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    /** Soft-deleted marker (undoable removal). */
    deletedAt: integer("deleted_at", tsMs),
    createdAt: integer("created_at", tsMs)
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
  },
  (table) => [
    index("attachments_entity_id_idx").on(table.entityId),
    index("attachments_entity_deleted_idx").on(table.entityId, table.deletedAt),
  ],
);
