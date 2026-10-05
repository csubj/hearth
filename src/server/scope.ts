/**
 * Property scope filter (design D7, task 7.4).
 *
 * The property scope is stored per-user in `user_preferences.property_scope`
 * (a place entity id, or NULL/absent for "All"). One SQL fragment applies it
 * everywhere — lists, Today, search, and the due feed.
 *
 * An entity is in scope if:
 *   - it has no place (unplaced entities always stay visible), OR
 *   - it is itself a place in the selected property subtree, OR
 *   - its place's path is in the selected property subtree.
 *
 * The inbox is never scoped.
 *
 * The path range uses the indexed prefix range `path >= :p AND path < :p || '~'`
 * (D7), never LIKE.
 */

import type Database from "better-sqlite3";

/** Read a user's selected property scope id (or null for "All"). */
export function resolvePropertyScope(
  conn: Database.Database,
  userId: string,
): string | null {
  const row = conn
    .prepare(
      "SELECT property_scope FROM user_preferences WHERE user_id = ?",
    )
    .get(userId) as { property_scope: string | null } | undefined;
  return row?.property_scope ?? null;
}

/**
 * Resolve the materialized path for a place entity id, or null if the id is
 * not a place (or has gone missing).
 */
export function placePath(
  conn: Database.Database,
  placeId: string,
): string | null {
  const row = conn
    .prepare("SELECT path FROM places WHERE entity_id = ?")
    .get(placeId) as { path: string } | undefined;
  return row?.path ?? null;
}

/**
 * Build the scope WHERE fragment for a single entity alias.
 *
 * Returns `{ sql, params }` where `sql` is appended to the query's WHERE
 * clause (an empty sql means no scope — the entity table alias `alias` is
 * used in the fragment). When the scope is not set or refers to an unknown
 * place, no filtering is applied.
 */
export function buildScopeFilter(
  conn: Database.Database,
  userId: string,
  alias = "e",
): { sql: string; params: unknown[] } {
  const scopeId = resolvePropertyScope(conn, userId);
  if (!scopeId) return { sql: "", params: [] };

  const p = placePath(conn, scopeId);
  if (!p) return { sql: "", params: [] };

  const sql =
    `(${alias}.place_id IS NULL` +
    ` OR ${alias}.id IN (SELECT entity_id FROM places WHERE path >= ? AND path < ? || '~')` +
    ` OR EXISTS (SELECT 1 FROM places pp WHERE pp.entity_id = ${alias}.place_id` +
    `   AND pp.path >= ? AND pp.path < ? || '~'))`;

  return { sql, params: [p, p, p, p] };
}
