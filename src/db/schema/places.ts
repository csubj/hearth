import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { entities } from "./entities";

/**
 * places — extension table for the places module (task 7.1, design D7).
 *
 * `entity_id` PK → entities ON DELETE CASCADE. `kind` is one of
 * property | structure | room | area. `path` is the materialized path
 * `/<rootId>/<childId>/.../`. A place's parent is its own `entities.place_id`,
 * so the tree uses the same column as every placed entity.
 */

export const places = sqliteTable("places", {
  /** FK to entities.id; also the primary key. The entity type is 'place'. */
  entityId: text("entity_id")
    .primaryKey()
    .references(() => entities.id, { onDelete: "cascade" }),
  /** Place kind: property | structure | room | area. */
  kind: text("kind").notNull(),
  /** Materialized path `/<rootId>/<childId>/.../` (D7). Unique per place. */
  path: text("path").notNull().unique(),
});
