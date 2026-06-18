import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const PROJECT_STATUSES = ["idea", "in_progress", "done"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_COMPONENT_KINDS = ["item", "labor", "fee", "other"] as const;
export type ProjectComponentKind = (typeof PROJECT_COMPONENT_KINDS)[number];

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    notes: text("notes"),
    status: text("status", { enum: PROJECT_STATUSES }).notNull().default("idea"),
    priority: integer("priority"),
    targetWhen: text("target_when"),
    budgetCents: integer("budget_cents"),
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
    index("projects_status_updated_at_idx").on(table.status, table.updatedAt),
    index("projects_priority_idx").on(table.priority),
  ],
);

export const projectLinks = sqliteTable("project_links", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  url: text("url").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const projectTags = sqliteTable(
  "project_tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("project_tags_name_idx").on(table.name)],
);

export const projectItemTags = sqliteTable(
  "project_item_tags",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => projectTags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.tagId] }),
    index("project_item_tags_project_id_idx").on(table.projectId),
    index("project_item_tags_tag_id_idx").on(table.tagId),
  ],
);

export const projectComponents = sqliteTable(
  "project_components",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind", { enum: PROJECT_COMPONENT_KINDS }).notNull().default("item"),
    quantity: integer("quantity").notNull().default(1),
    unitCostCents: integer("unit_cost_cents").notNull().default(0),
    acquired: integer("acquired", { mode: "boolean" }).notNull().default(false),
    acquiredAt: integer("acquired_at", { mode: "timestamp_ms" }),
    purchaseUrl: text("purchase_url"),
    sortOrder: integer("sort_order").notNull().default(0),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("project_components_project_id_idx").on(table.projectId)],
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectLink = typeof projectLinks.$inferSelect;
export type ProjectTag = typeof projectTags.$inferSelect;
export type ProjectComponent = typeof projectComponents.$inferSelect;
