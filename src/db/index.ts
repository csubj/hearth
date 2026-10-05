import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { openDatabase } from "./client";

export * as schema from "./schema";
export { applyDatabasePragmas, DATABASE_PRAGMAS, openDatabase } from "./client";
export { DEFAULT_DATABASE_URL, resolveDatabasePath } from "./path";

/**
 * The single connection for this household (design D19). Importing this module
 * opens (or creates) the database file and applies the D19 pragmas. Do not open
 * a second connection in the same process.
 */
export const sqlite = openDatabase();

export const db = drizzle(sqlite, { schema });
