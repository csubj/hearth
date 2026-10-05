import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

// ---------------------------------------------------------------------------
// user_preferences — per-user settings (design D8)
// ---------------------------------------------------------------------------

export const userPreferences = sqliteTable("user_preferences", {
  /** The owning user. One row per user. */
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Active property scope for place-filtered views (D7). Set in task 7.4. */
  propertyScope: text("property_scope"),
  /** UI theme preference: 'light' | 'dark' | 'system'. */
  theme: text("theme"),
});
