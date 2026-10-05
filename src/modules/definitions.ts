/**
 * Central module definitions index (task 6.1, design D2).
 *
 * Collects every module's isomorphic definition into a single record.
 * Module procedures, nav, quick-create, lists, detail pages, search, and
 * the API iterate this record.
 *
 * Import each module's definition here as it is added (task 6.3+).
 */

import type { ModuleDefinition } from "./types";

// ---------------------------------------------------------------------------
// Module definitions — add imports here as modules are registered
// ---------------------------------------------------------------------------

import { notesPageDefinition } from "./notes-page/definition";
import { placeDefinition } from "./place/definition";

// ---------------------------------------------------------------------------
// Definitions record, keyed by type
// ---------------------------------------------------------------------------

/**
 * All registered module definitions, keyed by their `type` string.
 */
export const definitions: Record<string, ModuleDefinition> = {
  "notes-page": notesPageDefinition,
  place: placeDefinition,
};

/**
 * All definitions as an array, for iteration.
 */
export function allDefinitions(): ModuleDefinition[] {
  return Object.values(definitions);
}
