import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const trackers = sqliteTable("trackers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  unit: text("unit"),
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const trackerEntries = sqliteTable(
  "tracker_entries",
  {
    id: text("id").primaryKey(),
    trackerId: text("tracker_id")
      .notNull()
      .references(() => trackers.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    note: text("note"),
    recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("tracker_entries_tracker_id_recorded_at_idx").on(table.trackerId, table.recordedAt),
  ],
);

export type Tracker = typeof trackers.$inferSelect;
export type NewTracker = typeof trackers.$inferInsert;
export type TrackerEntry = typeof trackerEntries.$inferSelect;
export type NewTrackerEntry = typeof trackerEntries.$inferInsert;
