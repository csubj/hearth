import { sqliteTable, text, primaryKey } from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { entities } from "./entities";

// ---------------------------------------------------------------------------
// pins — per-member pinned entities (design D8, task 13.4)
// ---------------------------------------------------------------------------

export const pins = sqliteTable(
  "pins",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.entityId] })],
);
