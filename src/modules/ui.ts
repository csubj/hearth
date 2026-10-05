/**
 * Central module UI index (task 6.1, design D2).
 *
 * Collects every module's optional UI overrides (detail section, list row).
 * The generic list/detail routes (task 6.4) use this to render modules.
 */

"use client";

import type { ModuleUI } from "./types";

// ---------------------------------------------------------------------------
// Module UIs — add imports here as modules are registered
// ---------------------------------------------------------------------------

import { notesPageUI } from "./notes-page/ui";
import { placeUI } from "./place/ui";

// ---------------------------------------------------------------------------
// UIs record, keyed by type
// ---------------------------------------------------------------------------

/**
 * All registered module UIs, keyed by their `type` string.
 * Modules without UI overrides may be absent from this record
 * (the generic UI is used).
 */
export const uis: Record<string, ModuleUI> = {
  "notes-page": notesPageUI,
  place: placeUI,
};

/**
 * Look up a module UI by type. Returns undefined for unknown types
 * (the generic UI should be used).
 */
export function getUI(type: string): ModuleUI | undefined {
  return uis[type];
}
