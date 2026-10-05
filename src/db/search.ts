/**
 * FTS5 search index helpers (design D10, task 3.3 + 12.2).
 *
 * `reindex(conn, entityId)` recomposes the FTS5 `search_index` row for one
 * entity from its title, the module's text fields, notes Markdown, and
 * comment Markdown. A created entity is therefore findable immediately.
 *
 * `rebuildAllIndex(conn)` clears and rebuilds the whole index (used by the
 * `pnpm search:rebuild` CLI and as a recovery path), and
 * `checkSearchConsistency(conn)` repairs drift (orphan rows removed, missing
 * rows restored) for the daily job.
 *
 * Uses raw SQL because Drizzle cannot model FTS5 virtual tables. The module
 * text fields are read generically from the per-module details table (named
 * `<type>_details`, or the special `places` table for the place module)
 * rather than importing the module registry, so this module stays free of
 * `server-only` and is importable from the tsx CLI scripts.
 */
import type Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Module details text
// ---------------------------------------------------------------------------

/**
 * Read a module's text fields for an entity by querying its `<type>_details`
 * table and concatenating every scalar (string/number) column. The place
 * module stores its `kind`/`path` in the special `places` table instead.
 *
 * This covers "module text fields" without importing the (server-only)
 * module registry, which keeps the CLI scripts runnable under plain tsx.
 */
function moduleText(
  conn: Database.Database,
  entityId: string,
  type: string,
): string {
  const table = type === "place" ? "places" : `${type.replace(/-/g, "_")}_details`;

  // The module's details table may not exist (e.g. a test procedure uses a
  // synthetic module type). Treat a missing table as "no module text".
  let row: Record<string, unknown> | undefined;
  try {
    row = conn
      .prepare(`SELECT * FROM ${table} WHERE entity_id = ?`)
      .get(entityId) as Record<string, unknown> | undefined;
  } catch {
    return "";
  }
  if (!row) return "";

  const parts: string[] = [];
  for (const [key, value] of Object.entries(row)) {
    if (key === "entity_id") continue; // PK noise
    if (typeof value === "string" || typeof value === "number") {
      parts.push(String(value));
    }
  }
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// searchText — compose the searchable body for one entity
// ---------------------------------------------------------------------------

/**
 * Compose the searchable body text for an entity from:
 *   - the module's text fields (via the details table), and
 *   - the entity's notes Markdown and every comment's Markdown.
 *
 * The title is not included here because it is stored separately in the
 * `title` column and weighted higher by bm25 (D10).
 */
function searchText(
  conn: Database.Database,
  entityId: string,
  type: string,
): string {
  const parts: string[] = [];

  const details = moduleText(conn, entityId, type);
  if (details) parts.push(details);

  const note = conn
    .prepare("SELECT markdown FROM notes WHERE entity_id = ?")
    .get(entityId) as { markdown: string } | undefined;
  if (note?.markdown) parts.push(note.markdown);

  const comments = conn
    .prepare("SELECT markdown FROM comments WHERE entity_id = ?")
    .all(entityId) as Array<{ markdown: string }>;
  for (const c of comments) {
    if (c.markdown) parts.push(c.markdown);
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// reindex — recompose one entity's search_index row
// ---------------------------------------------------------------------------

/**
 * Delete and re-insert the FTS5 `search_index` row for one entity.
 *
 * Must be called inside a transaction so the delete+insert is atomic.
 * Skips the insert when the entity does not exist (purged between touch
 * and flush).
 */
export function reindex(conn: Database.Database, entityId: string): void {
  conn
    .prepare("DELETE FROM search_index WHERE entity_id = ?")
    .run(entityId);

  const entity = conn
    .prepare("SELECT id, type, title FROM entities WHERE id = ?")
    .get(entityId) as { id: string; type: string; title: string } | undefined;

  if (!entity) return;

  const body = searchText(conn, entityId, entity.type);

  conn
    .prepare(
      "INSERT INTO search_index (entity_id, type, title, body) VALUES (?, ?, ?, ?)",
    )
    .run(entity.id, entity.type, entity.title, body);
}

// ---------------------------------------------------------------------------
// rebuildAllIndex — clear and rebuild the whole index
// ---------------------------------------------------------------------------

/**
 * Clear the entire `search_index` and re-insert one row for every entity.
 * Used by the `search:rebuild` CLI script and as the recovery path for the
 * daily consistency check when the index has drifted badly.
 */
export function rebuildAllIndex(conn: Database.Database): number {
  conn.prepare("DELETE FROM search_index").run();

  const entities = conn
    .prepare("SELECT id, type, title FROM entities")
    .all() as Array<{ id: string; type: string; title: string }>;

  const insert = conn.prepare(
    "INSERT INTO search_index (entity_id, type, title, body) VALUES (?, ?, ?, ?)",
  );

  let count = 0;
  for (const entity of entities) {
    const body = searchText(conn, entity.id, entity.type);
    insert.run(entity.id, entity.type, entity.title, body);
    count++;
  }

  return count;
}

// ---------------------------------------------------------------------------
// checkSearchConsistency — detect and repair index drift (design D10, task 12.2)
// ---------------------------------------------------------------------------

/**
 * Compare the `search_index` rows with the `entities` table and repair any
 * drift:
 *   - remove rows whose entity has been purged (orphans), and
 *   - (re)index any entity that has no search row (missing / deleted).
 *
 * Returns the number of rows repaired (orphans removed + entities indexed).
 * It does NOT rebuild the whole index; it only fixes the specific drift.
 * Callers log the repair count (the daily job and the CLI).
 */
export function checkSearchConsistency(conn: Database.Database): number {
  let repaired = 0;

  // Remove index rows for entities that no longer exist (purged entities).
  const orphans = conn
    .prepare(
      "SELECT DISTINCT entity_id FROM search_index WHERE entity_id NOT IN (SELECT id FROM entities)",
    )
    .all() as Array<{ entity_id: string }>;
  if (orphans.length > 0) {
    const deleteStmt = conn.prepare(
      "DELETE FROM search_index WHERE entity_id = ?",
    );
    for (const o of orphans) {
      deleteStmt.run(o.entity_id);
    }
    repaired += orphans.length;
  }

  // (Re)index entities that have no search row.
  const missing = conn
    .prepare(
      "SELECT id FROM entities WHERE id NOT IN (SELECT entity_id FROM search_index)",
    )
    .all() as Array<{ id: string }>;
  for (const m of missing) {
    reindex(conn, m.id);
    repaired += 1;
  }

  return repaired;
}
