import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
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

function ensureDatabaseDirectory(dbPath: string): void {
  if (dbPath === ":memory:") {
    return;
  }

  const dir = path.dirname(dbPath);
  if (dir && dir !== ".") {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function applyMigrationsIfNeeded(db: BetterSQLite3Database<typeof schema>): void {
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!instance) {
    const pathOrMemory = resolveDatabasePath();
    ensureDatabaseDirectory(pathOrMemory);
    const sqlite = new Database(pathOrMemory);
    sqlite.pragma("foreign_keys = ON");
    instance = drizzle(sqlite, { schema });
  }

  applyMigrationsIfNeeded(instance);
  return instance;
}

/** Test-only: reset singleton so a fresh in-memory DB can be opened. */
export function resetDbForTests(): void {
  instance = undefined;
}
