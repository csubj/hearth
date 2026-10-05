/**
 * notes-page module server (task 6.3, design D18).
 *
 * Provides the details table, searchText, and summary for the notes-page module.
 */

import "server-only";

import type { ModuleServer } from "../types";
import { notesPageDetails } from "../../db/schema/notes-page";

export type NotesPageDetailsTable = typeof notesPageDetails;

export const notesPageServer: ModuleServer<
  "notes-page",
  NotesPageDetailsTable
> = {
  type: "notes-page",
  detailsTable: notesPageDetails,

  searchText(details) {
    const parts: string[] = [];
    if (details.category) parts.push(details.category);
    return parts.join(" ");
  },

  summary(entity, details) {
    return {
      title: entity.title,
      category: details.category ?? null,
      reviewOn: details.reviewOn ?? null,
    };
  },
};
