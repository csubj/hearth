import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import { applyDatabasePragmas } from "./client";

/** Where drizzle-kit writes committed migrations. */
export const MIGRATIONS_FOLDER = "./drizzle";

export interface TestDatabase {
  client: BetterSQLite3Database<typeof schema>;
  connection: Database.Database;
}

/**
 * Open a fresh in-memory better-sqlite3 database, apply every migration in
 * `drizzle/`, and return the Drizzle client + its connection. Used by Vitest via
 * a server-side router client (design D21) — no ad-hoc table helpers.
 */
export function createTestDatabase(): TestDatabase {
  const connection = new Database(":memory:");
  applyDatabasePragmas(connection);
  const client = drizzle(connection, { schema });
  migrate(client, { migrationsFolder: MIGRATIONS_FOLDER });
  return { client, connection };
}
