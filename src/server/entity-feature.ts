/**
 * Shared authorization helper for entity-scoped shared features (tasks 8.x).
 *
 * `assertEntityFeature(entityId, feature)` loads the entity and verifies that
 * (a) it exists and is not trashed (404 otherwise), and (b) the owning module
 * enables the given shared feature (403 otherwise). Authorization for feature
 * gating lives here and is reused by the tags / links / URLs / attachments
 * procedures.
 *
 * The feature set per module comes from the registry (`getModule.type.features`),
 * not from a hardcoded list, so a module that does not enable a feature always
 * gets a 403.
 */

import "server-only";

import { ORPCError } from "@orpc/server";
import { ERROR_STATUS_MAP } from "./orpc";
import { getModule } from "../modules/registry";
import { db } from "../db";

/** Sniff whether a module's features object enables `feature`. */
export function isFeatureEnabledOn(
  features: Record<string, unknown>,
  feature: string,
): boolean {
  const val = features[feature];
  if (val === undefined || val === false) return false;
  // true or an object like { documents: true } both count as enabled.
  return true;
}

/**
 * Load a live (non-trashed) entity by id, or throw not_found. Returns the
 * entity row (raw, snake_case columns) so callers can reuse it.
 */
export function assertEntityLive(
  entityId: string,
): { id: string; type: string; title: string } {
  const conn = (db as unknown as { $client: import("better-sqlite3").Database })
    .$client;
  const row = conn
    .prepare(
      "SELECT id, type, title, deleted_at FROM entities WHERE id = ?",
    )
    .get(entityId) as
    | { id: string; type: string; title: string; deleted_at: number | null }
    | undefined;

  if (!row || row.deleted_at !== null) {
    throw new ORPCError("not_found", {
      status: ERROR_STATUS_MAP.not_found,
      message: "Entity not found.",
    });
  }
  return { id: row.id, type: row.type, title: row.title };
}

/**
 * Load the entity by id and assert the module enables `feature`.
 * Throws not_found for a missing or trashed entity, forbidden when the module
 * does not enable the feature.
 *
 * Returns the entity row (raw, snake_case columns) so callers can reuse it.
 */
export function assertEntityFeature(
  entityId: string,
  feature: string,
): { id: string; type: string; title: string } {
  const row = assertEntityLive(entityId);

  const mod = getModule(row.type);
  if (!mod) {
    throw new ORPCError("not_found", {
      status: ERROR_STATUS_MAP.not_found,
      message: "Unknown module type.",
    });
  }

  if (!isFeatureEnabledOn(mod.definition.features as Record<string, unknown>, feature)) {
    throw new ORPCError("forbidden", {
      status: ERROR_STATUS_MAP.forbidden,
      message: `Feature "${feature}" is not enabled for module "${row.type}".`,
    });
  }

  return row;
}
