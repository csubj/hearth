/**
 * notes-page module definition (task 6.3, design D18).
 *
 * "Household notes": title, category enum, optional review_on date.
 * placeRule: optional. All shared features enabled.
 */

import * as z from "zod";
import type { ModuleDefinition } from "../types";

// ---------------------------------------------------------------------------
// Fields schema
// ---------------------------------------------------------------------------

const CATEGORIES = ["reference", "how-to", "contacts", "other"] as const;

export const notesPageFields = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title must be at most 200 characters")
    .meta({ label: "Title" }),
  category: z
    .enum(CATEGORIES)
    .optional()
    .meta({ label: "Category" }),
  reviewOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
    .optional()
    .meta({ label: "Review on" }),
});

export type NotesPageFields = typeof notesPageFields;

// ---------------------------------------------------------------------------
// Definition
// ---------------------------------------------------------------------------

export const notesPageDefinition: ModuleDefinition<
  "notes-page",
  NotesPageFields
> = {
  type: "notes-page",
  label: { singular: "Household note", plural: "Household notes" },
  icon: "notebook-text",
  fields: notesPageFields,
  listColumns: ["category", "reviewOn"],
  filters: ["category"],
  sorts: {
    title: { table: "entities", column: "title" },
    category: { table: "details", column: "category" },
    reviewOn: { table: "details", column: "review_on" },
    createdAt: { table: "entities", column: "created_at" },
    updatedAt: { table: "entities", column: "updated_at" },
  },
  placeRule: "optional",
  features: {
    notes: true,
    comments: true,
    attachments: { documents: true },
    reminders: true,
    assignees: true,
    links: true,
    tags: true,
  },
  quickCreate: ["title", "category"],
  detailSections: [
    { key: "notes", label: "Notes", order: 0 },
    { key: "reminders", label: "Reminders", order: 10 },
    { key: "comments", label: "Comments", order: 20 },
  ],
};
