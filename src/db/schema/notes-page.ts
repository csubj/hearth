/**
 * notes_page_details — extension table for the notes-page module (task 6.3, design D1/D18).
 *
 * entity_id PK → entities ON DELETE CASCADE; typed columns for category and review_on.
 */

import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { entities } from "./entities";

export const notesPageDetails = sqliteTable("notes_page_details", {
  /** FK to entities.id; also the primary key. */
  entityId: text("entity_id")
    .primaryKey()
    .references(() => entities.id, { onDelete: "cascade" }),
  /** Optional enum: reference | how-to | contacts | other. */
  category: text("category"),
  /** Optional review date as ISO YYYY-MM-DD string. */
  reviewOn: text("review_on"),
});
