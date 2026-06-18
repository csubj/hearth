import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { metricReminderUnits } from "./metrics";
import { users } from "./users";

export const maintenanceReminderUnits = metricReminderUnits;
export type MaintenanceReminderUnit = (typeof maintenanceReminderUnits)[number];

export const inventoryItems = sqliteTable(
  "inventory_items",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    brand: text("brand"),
    model: text("model"),
    serial: text("serial"),
    itemType: text("item_type"),
    location: text("location"),
    purchaseDate: integer("purchase_date", { mode: "timestamp_ms" }),
    store: text("store"),
    price: text("price"),
    warrantyNote: text("warranty_note"),
    notes: text("notes"),
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
    index("inventory_items_name_idx").on(table.name),
    index("inventory_items_item_type_idx").on(table.itemType),
    index("inventory_items_location_idx").on(table.location),
    index("inventory_items_updated_at_idx").on(table.updatedAt),
  ],
);

export const inventoryLinks = sqliteTable("inventory_links", {
  id: text("id").primaryKey(),
  inventoryItemId: text("inventory_item_id")
    .notNull()
    .references(() => inventoryItems.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  url: text("url").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const inventoryTags = sqliteTable(
  "inventory_tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("inventory_tags_name_idx").on(table.name)],
);

export const inventoryItemTags = sqliteTable(
  "inventory_item_tags",
  {
    inventoryItemId: text("inventory_item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => inventoryTags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.inventoryItemId, table.tagId] }),
    index("inventory_item_tags_item_id_idx").on(table.inventoryItemId),
    index("inventory_item_tags_tag_id_idx").on(table.tagId),
  ],
);

export const inventoryMaintenanceReminders = sqliteTable(
  "inventory_maintenance_reminders",
  {
    id: text("id").primaryKey(),
    inventoryItemId: text("inventory_item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    notes: text("notes"),
    reminderIntervalCount: integer("reminder_interval_count"),
    reminderIntervalUnit: text("reminder_interval_unit", {
      enum: maintenanceReminderUnits,
    }),
    reminderRecipientUserId: text("reminder_recipient_user_id").references(() => users.id),
    lastCompletedAt: integer("last_completed_at", { mode: "timestamp_ms" }),
    lastReminderAt: integer("last_reminder_at", { mode: "timestamp_ms" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("inventory_maintenance_reminders_item_id_idx").on(table.inventoryItemId)],
);

export const inventoryMaintenanceReminderLinks = sqliteTable(
  "inventory_maintenance_reminder_links",
  {
    id: text("id").primaryKey(),
    reminderId: text("reminder_id")
      .notNull()
      .references(() => inventoryMaintenanceReminders.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    url: text("url").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("inventory_maintenance_reminder_links_reminder_id_idx").on(table.reminderId),
  ],
);

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type NewInventoryItem = typeof inventoryItems.$inferInsert;
export type InventoryLink = typeof inventoryLinks.$inferSelect;
export type InventoryTag = typeof inventoryTags.$inferSelect;
export type InventoryMaintenanceReminder = typeof inventoryMaintenanceReminders.$inferSelect;
export type NewInventoryMaintenanceReminder = typeof inventoryMaintenanceReminders.$inferInsert;
export type InventoryMaintenanceReminderLink =
  typeof inventoryMaintenanceReminderLinks.$inferSelect;
