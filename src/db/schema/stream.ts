import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const streamEntries = sqliteTable(
  "stream_entries",
  {
    id: text("id").primaryKey(),
    body: text("body").notNull(),
    isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
    doneAt: integer("done_at", { mode: "timestamp_ms" }),
    roughWhen: text("rough_when"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("stream_entries_created_at_idx").on(table.createdAt),
    index("stream_entries_pinned_created_at_idx").on(table.isPinned, table.createdAt),
    index("stream_entries_done_at_idx").on(table.doneAt),
  ],
);

export type StreamEntry = typeof streamEntries.$inferSelect;
export type NewStreamEntry = typeof streamEntries.$inferInsert;
