/**
 * Collaboration shared tables (design D8, tasks 9.1–9.5).
 *
 * Notes, comments, mentions and assignees all reference an entity and are
 * removed on purge (ON DELETE CASCADE). Soft delete leaves rows intact.
 */

import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { entities } from "./entities";
import { user } from "./auth";
import type { RichTextDoc } from "../../lib/richtext";

/** Milliseconds-since-epoch timestamp (consistent with the entities schema). */
const tsMs = { mode: "timestamp_ms" } as const;
const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

// ---------------------------------------------------------------------------
// notes — one rich-text document per entity that enables notes (design D9)
// ---------------------------------------------------------------------------
export const notes = sqliteTable("notes", {
  /** PK + FK to entities.id (one notes document per entity). */
  entityId: text("entity_id")
    .primaryKey()
    .references(() => entities.id, { onDelete: "cascade" }),
  /** Canonical ProseMirror document. */
  doc: text("doc", { mode: "json" }).$type<RichTextDoc>().notNull(),
  /** Normalised Markdown form, derived from the document. */
  markdown: text("markdown").notNull(),
  /** Notes-specific version, used for expectedVersion conflicts (D13). */
  version: integer("version").notNull().default(1),
  updatedBy: text("updated_by")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
  updatedAt: integer("updated_at", tsMs).notNull().default(nowMs),
});

// ---------------------------------------------------------------------------
// comments — a chronological thread per entity (design D8, task 9.3)
// ---------------------------------------------------------------------------
export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    /** Canonical ProseMirror document. */
    doc: text("doc", { mode: "json" }).$type<RichTextDoc>().notNull(),
    /** Normalised Markdown form. */
    markdown: text("markdown").notNull(),
    editedAt: integer("edited_at", tsMs),
    createdAt: integer("created_at", tsMs).notNull().default(nowMs),
  },
  (table) => [
    index("comments_entity_id_created_at_idx").on(table.entityId, table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// mentions — current mention set per source, used for diffing (design D8, task 9.4)
// ---------------------------------------------------------------------------
export const mentions = sqliteTable(
  "mentions",
  {
    /** "note" | "comment". */
    sourceType: text("source_type").notNull(),
    /** The note entity id or comment id. */
    sourceId: text("source_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.sourceType, table.sourceId, table.userId] })],
);

// ---------------------------------------------------------------------------
// entity_assignees — zero or more assignees per entity (design D8, task 9.5)
// ---------------------------------------------------------------------------
export const entityAssignees = sqliteTable(
  "entity_assignees",
  {
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.entityId, table.userId] }),
    index("entity_assignees_user_id_idx").on(table.userId),
  ],
);
