import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

let instance: BetterSQLite3Database<typeof schema> | undefined;
let migrationsApplied = false;

const migrationsFolder = path.join(process.cwd(), "drizzle");

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

function getExpectedMigrationCount(): number {
  const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
    entries: unknown[];
  };
  return journal.entries.length;
}

function getAppliedMigrationCount(sqlite: Database.Database): number {
  try {
    const row = sqlite.prepare("SELECT COUNT(*) AS count FROM __drizzle_migrations").get() as {
      count: number;
    };
    return row.count;
  } catch {
    return 0;
  }
}

function migrationsAreComplete(sqlite: Database.Database): boolean {
  return getAppliedMigrationCount(sqlite) >= getExpectedMigrationCount();
}

function isMigrationRaceError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}`
      : String(error);
  return message.includes("already exists");
}

function applyMigrationsIfNeeded(
  db: BetterSQLite3Database<typeof schema>,
  sqlite: Database.Database,
): void {
  if (migrationsApplied || process.env.SKIP_AUTO_MIGRATE === "1") {
    return;
  }

  sqlite.pragma("busy_timeout = 5000");

  try {
    migrate(db, { migrationsFolder });
  } catch (error) {
    if (isMigrationRaceError(error) && migrationsAreComplete(sqlite)) {
      migrationsApplied = true;
      return;
    }

    throw error;
  }

  migrationsApplied = true;
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!instance) {
    const pathOrMemory = resolveDatabasePath();
    ensureDatabaseDirectory(pathOrMemory);
    const sqlite = new Database(pathOrMemory);
    sqlite.pragma("foreign_keys = ON");
    instance = drizzle(sqlite, { schema });
    applyMigrationsIfNeeded(instance, sqlite);
  }

  return instance;
}

/** Test-only: reset singleton so a fresh in-memory DB can be opened. */
export function resetDbForTests(): void {
  instance = undefined;
  migrationsApplied = false;
}
