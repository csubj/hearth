import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { inventoryItems } from "./inventory";
import { metricReminderUnits } from "./metrics";
import { projects } from "./projects";
import { users } from "./users";

export const MAINTENANCE_REMINDER_TYPES = ["interval", "one_time"] as const;
export type MaintenanceReminderType = (typeof MAINTENANCE_REMINDER_TYPES)[number];

export type MaintenanceLogReminderUnit = (typeof metricReminderUnits)[number];

export const maintenanceLogs = sqliteTable(
  "maintenance_logs",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    notes: text("notes"),
    category: text("category"),
    company: text("company"),
    costCents: integer("cost_cents"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
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
    index("maintenance_logs_updated_at_idx").on(table.updatedAt),
    index("maintenance_logs_category_idx").on(table.category),
    index("maintenance_logs_company_idx").on(table.company),
  ],
);

export const maintenanceLogLinks = sqliteTable("maintenance_log_links", {
  id: text("id").primaryKey(),
  maintenanceLogId: text("maintenance_log_id")
    .notNull()
    .references(() => maintenanceLogs.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  url: text("url").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const maintenanceLogTags = sqliteTable(
  "maintenance_log_tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("maintenance_log_tags_name_idx").on(table.name)],
);

export const maintenanceLogItemTags = sqliteTable(
  "maintenance_log_item_tags",
  {
    maintenanceLogId: text("maintenance_log_id")
      .notNull()
      .references(() => maintenanceLogs.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => maintenanceLogTags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.maintenanceLogId, table.tagId] }),
    index("maintenance_log_item_tags_log_id_idx").on(table.maintenanceLogId),
    index("maintenance_log_item_tags_tag_id_idx").on(table.tagId),
  ],
);

export const maintenanceLogReminders = sqliteTable(
  "maintenance_log_reminders",
  {
    id: text("id").primaryKey(),
    maintenanceLogId: text("maintenance_log_id")
      .notNull()
      .references(() => maintenanceLogs.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    notes: text("notes"),
    reminderType: text("reminder_type", { enum: MAINTENANCE_REMINDER_TYPES }).notNull(),
    reminderIntervalCount: integer("reminder_interval_count"),
    reminderIntervalUnit: text("reminder_interval_unit", {
      enum: metricReminderUnits,
    }),
    dueAt: integer("due_at", { mode: "timestamp_ms" }),
    reminderRecipientUserId: text("reminder_recipient_user_id").references(() => users.id),
    lastCompletedAt: integer("last_completed_at", { mode: "timestamp_ms" }),
    lastReminderAt: integer("last_reminder_at", { mode: "timestamp_ms" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("maintenance_log_reminders_log_id_idx").on(table.maintenanceLogId)],
);

export const maintenanceLogProjects = sqliteTable(
  "maintenance_log_projects",
  {
    maintenanceLogId: text("maintenance_log_id")
      .notNull()
      .references(() => maintenanceLogs.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.maintenanceLogId, table.projectId] }),
    index("maintenance_log_projects_log_id_idx").on(table.maintenanceLogId),
    index("maintenance_log_projects_project_id_idx").on(table.projectId),
  ],
);

export const maintenanceLogInventoryItems = sqliteTable(
  "maintenance_log_inventory_items",
  {
    maintenanceLogId: text("maintenance_log_id")
      .notNull()
      .references(() => maintenanceLogs.id, { onDelete: "cascade" }),
    inventoryItemId: text("inventory_item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.maintenanceLogId, table.inventoryItemId] }),
    index("maintenance_log_inventory_items_log_id_idx").on(table.maintenanceLogId),
    index("maintenance_log_inventory_items_item_id_idx").on(table.inventoryItemId),
  ],
);

export type MaintenanceLog = typeof maintenanceLogs.$inferSelect;
export type NewMaintenanceLog = typeof maintenanceLogs.$inferInsert;
export type MaintenanceLogLink = typeof maintenanceLogLinks.$inferSelect;
export type MaintenanceLogTag = typeof maintenanceLogTags.$inferSelect;
export type MaintenanceLogReminder = typeof maintenanceLogReminders.$inferSelect;
export type NewMaintenanceLogReminder = typeof maintenanceLogReminders.$inferInsert;
