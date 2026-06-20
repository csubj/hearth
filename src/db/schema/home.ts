import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const HOME_SPACE_KINDS = ["property", "structure", "room", "area"] as const;
export type HomeSpaceKind = (typeof HOME_SPACE_KINDS)[number];

export const HOME_ITEM_KINDS = [
  "paint",
  "appliance",
  "electrical",
  "plumbing",
  "fixture",
  "flooring",
  "window_treatment",
  "generic",
] as const;
export type HomeItemKind = (typeof HOME_ITEM_KINDS)[number];

export const HOME_LINK_SOURCE_TYPES = ["home_space", "home_item"] as const;
export type HomeLinkSourceType = (typeof HOME_LINK_SOURCE_TYPES)[number];

export const HOME_LINK_TARGET_TYPES = ["maintenance_log", "inventory_item", "project"] as const;
export type HomeLinkTargetType = (typeof HOME_LINK_TARGET_TYPES)[number];

export const homeSpaces = sqliteTable(
  "home_spaces",
  {
    id: text("id").primaryKey(),
    parentId: text("parent_id").references((): AnySQLiteColumn => homeSpaces.id, {
      onDelete: "cascade",
    }),
    kind: text("kind", { enum: HOME_SPACE_KINDS }).notNull().default("room"),
    name: text("name").notNull(),
    address: text("address"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
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
    index("home_spaces_parent_id_idx").on(table.parentId),
    index("home_spaces_kind_idx").on(table.kind),
    index("home_spaces_updated_at_idx").on(table.updatedAt),
  ],
);

export const homeItems = sqliteTable(
  "home_items",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id")
      .notNull()
      .references(() => homeSpaces.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: HOME_ITEM_KINDS }).notNull().default("generic"),
    name: text("name").notNull(),
    manufacturer: text("manufacturer"),
    modelNumber: text("model_number"),
    serialNumber: text("serial_number"),
    colorName: text("color_name"),
    colorHex: text("color_hex"),
    finish: text("finish"),
    productUrl: text("product_url"),
    purchasedAt: integer("purchased_at", { mode: "timestamp_ms" }),
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
    index("home_items_space_id_idx").on(table.spaceId),
    index("home_items_kind_idx").on(table.kind),
    index("home_items_updated_at_idx").on(table.updatedAt),
  ],
);

export const homeLinks = sqliteTable(
  "home_links",
  {
    id: text("id").primaryKey(),
    sourceType: text("source_type", { enum: HOME_LINK_SOURCE_TYPES }).notNull(),
    sourceId: text("source_id").notNull(),
    targetType: text("target_type", { enum: HOME_LINK_TARGET_TYPES }).notNull(),
    targetId: text("target_id").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("home_links_unique_idx").on(
      table.sourceType,
      table.sourceId,
      table.targetType,
      table.targetId,
    ),
    index("home_links_source_idx").on(table.sourceType, table.sourceId),
    index("home_links_target_idx").on(table.targetType, table.targetId),
  ],
);

export type HomeSpace = typeof homeSpaces.$inferSelect;
export type NewHomeSpace = typeof homeSpaces.$inferInsert;
export type HomeItem = typeof homeItems.$inferSelect;
export type NewHomeItem = typeof homeItems.$inferInsert;
export type HomeLink = typeof homeLinks.$inferSelect;
