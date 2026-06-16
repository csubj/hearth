import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const metrics = sqliteTable("metrics", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  unit: text("unit"),
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const metricEntries = sqliteTable(
  "metric_entries",
  {
    id: text("id").primaryKey(),
    metricId: text("metric_id")
      .notNull()
      .references(() => metrics.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    note: text("note"),
    recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("metric_entries_metric_id_recorded_at_idx").on(table.metricId, table.recordedAt),
  ],
);

export type Metric = typeof metrics.$inferSelect;
export type NewMetric = typeof metrics.$inferInsert;
export type MetricEntry = typeof metricEntries.$inferSelect;
export type NewMetricEntry = typeof metricEntries.$inferInsert;
