import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { resolveDatabasePath } from "./path";

/**
 * The pragmas required for one household on local disk (design D19).
 * better-sqlite3 has no open-time `pragma` option in v13, so these are applied
 * on connect right after the connection is opened.
 */
export const DATABASE_PRAGMAS = [
  "journal_mode = WAL",
  "synchronous = FULL",
  "foreign_keys = ON",
  "busy_timeout = 5000",
  "temp_store = MEMORY",
] as const;

export function applyDatabasePragmas(connection: Database.Database): void {
  for (const pragma of DATABASE_PRAGMAS) {
    connection.pragma(pragma);
  }
}

/**
 * Open a single better-sqlite3 connection to the given DATABASE_URL (default
 * `file:./data/hearth.db`), applying the D19 pragmas on connect.
 *
 * Only one connection per household (design D19); the caller owns the returned
 * connection and must close it when done.
 */
export function openDatabase(rawUrl?: string): Database.Database {
  const path = resolveDatabasePath(rawUrl);

  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const connection = new Database(path);
  applyDatabasePragmas(connection);
  return connection;
}
