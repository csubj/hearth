/**
 * Central module servers index (task 6.1, design D2).
 *
 * Collects every module's server registration (details table, searchText,
 * summary). The procedure generator (task 6.2) and search reindexer use this.
 *
 * This file is `server-only` — it imports Drizzle tables.
 */

import "server-only";

import type { AnyModuleServer } from "./types";

// ---------------------------------------------------------------------------
// Module servers — add imports here as modules are registered
// ---------------------------------------------------------------------------

import { notesPageServer } from "./notes-page/server";
import { placeServer } from "./place/server";

// ---------------------------------------------------------------------------
// Servers record, keyed by type
// ---------------------------------------------------------------------------

/**
 * All registered module servers, keyed by their `type` string.
 */
export const servers: Record<string, AnyModuleServer> = {
  "notes-page": notesPageServer,
  place: placeServer,
};

/**
 * Look up a module server by type. Returns undefined for unknown types.
 */
export function getServer(type: string): AnyModuleServer | undefined {
  return servers[type];
}
