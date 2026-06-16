import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const mentions = sqliteTable(
  "mentions",
  {
    id: text("id").primaryKey(),
    mentionedUserId: text("mentioned_user_id")
      .notNull()
      .references(() => users.id),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("mentions_mentioned_user_created_at_idx").on(table.mentionedUserId, table.createdAt),
    index("mentions_entity_idx").on(table.entityType, table.entityId),
  ],
);

export type Mention = typeof mentions.$inferSelect;
export type NewMention = typeof mentions.$inferInsert;
