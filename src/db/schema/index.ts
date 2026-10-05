import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export * from "./auth";
export * from "./entities";
export * from "./attachments";
export * from "./organization";
export * from "./collaboration";
export * from "./notes-page";
export * from "./places";
export * from "./preferences";
export * from "./pins";

/**
 * Minimal placeholder table for task 1.5 so a real migration can be generated.
 * The full `entities` schema is added in a later phase (task 3.1) with a
 * hand-written SQL migration.
 */
export const meta = sqliteTable("_meta", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
