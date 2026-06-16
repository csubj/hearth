import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const restaurantStatuses = ["want_to_try", "visited"] as const;
export type RestaurantStatus = (typeof restaurantStatuses)[number];

export const restaurants = sqliteTable(
  "restaurants",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    neighborhood: text("neighborhood"),
    address: text("address"),
    notes: text("notes"),
    status: text("status", { enum: restaurantStatuses }).notNull().default("want_to_try"),
    rating: integer("rating"),
    visitNote: text("visit_note"),
    visitedAt: integer("visited_at", { mode: "timestamp_ms" }),
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
    index("restaurants_status_created_at_idx").on(table.status, table.createdAt),
    index("restaurants_rating_idx").on(table.rating),
  ],
);

export type Restaurant = typeof restaurants.$inferSelect;
export type NewRestaurant = typeof restaurants.$inferInsert;
