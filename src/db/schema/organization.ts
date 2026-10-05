import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { entities } from "./entities";
import { user } from "./auth";

/** Milliseconds-since-epoch timestamp (consistent with the entities schema). */
const tsMs = { mode: "timestamp_ms" } as const;
const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

// ---------------------------------------------------------------------------
// tags — shared case-insensitive labels (design D8, task 8.1)
// ---------------------------------------------------------------------------
export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  /**
   * Case-insensitive unique. The COLLATE NOCASE uniqueness is enforced by a
   * hand-written index in the migration (Drizzle's uniqueIndex does not
   * support a non-default collation), so this column is not declared unique
   * here.
   */
  name: text("name").notNull(),
  createdAt: integer("created_at", tsMs).notNull().default(nowMs),
});

/** Join table: which entities carry which tags. */
export const entityTags = sqliteTable(
  "entity_tags",
  {
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.entityId, table.tagId] }),
    index("entity_tags_tag_id_idx").on(table.tagId),
  ],
);

// ---------------------------------------------------------------------------
// entity_links — directed relations between entities (design D8, task 8.2)
// ---------------------------------------------------------------------------
export const entityLinks = sqliteTable(
  "entity_links",
  {
    id: text("id").primaryKey(),
    fromId: text("from_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    toId: text("to_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    /**
     * One of: related, part_of, uses, fixes, replaces.
     * `related` is symmetric and stored with from_id < to_id.
     */
    relation: text("relation").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", tsMs).notNull().default(nowMs),
  },
  (table) => [
    uniqueIndex("entity_links_pair_unique").on(
      table.fromId,
      table.toId,
      table.relation,
    ),
    index("entity_links_to_idx").on(table.toId),
    index("entity_links_from_idx").on(table.fromId),
  ],
);

// ---------------------------------------------------------------------------
// entity_urls — labeled external URLs (design D8, task 8.3)
// ---------------------------------------------------------------------------
export const entityUrls = sqliteTable(
  "entity_urls",
  {
    id: text("id").primaryKey(),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    url: text("url").notNull(),
    createdAt: integer("created_at", tsMs).notNull().default(nowMs),
  },
  (table) => [index("entity_urls_entity_id_idx").on(table.entityId)],
);
