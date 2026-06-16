import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

let instance: BetterSQLite3Database<typeof schema> | undefined;

function resolveDatabasePath(): string {
  const url = process.env.DATABASE_URL ?? "file:./data/hearth.db";
  if (url.startsWith("file:")) {
    return url.slice("file:".length);
  }
  return url;
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!instance) {
    const pathOrMemory = resolveDatabasePath();
    const sqlite = new Database(pathOrMemory);
    sqlite.pragma("foreign_keys = ON");
    instance = drizzle(sqlite, { schema });
  }
  return instance;
}

/** Test-only: reset singleton so a fresh in-memory DB can be opened. */
export function resetDbForTests(): void {
  instance = undefined;
}
