/**
 * Startup sequence and graceful shutdown (design D20, task 4.1).
 *
 * Startup: verify DB pragmas → detect pending migrations → back up before
 * migrating → apply migrations (exit non-zero on failure, naming the
 * pre-migration backup) → ready to serve.
 *
 * Shutdown: on SIGTERM/SIGINT stop the scheduler timer, wait for any running
 * tick to finish, then close the DB connection (which checkpoints the WAL).
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { stopScheduler } from "./jobs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Where drizzle-kit writes committed migrations. */
const MIGRATIONS_FOLDER = "./drizzle";

/** Directory for pre-migration backups (inside data/backups). */
function defaultBackupDir(): string {
  return join(process.cwd(), "data", "backups");
}

// ---------------------------------------------------------------------------
// Pending-migration detection
// ---------------------------------------------------------------------------

/**
 * Return true when the migrations folder contains entries that have not yet
 * been applied to the database. Compares `folderMillis` timestamps from the
 * migration journal against `__drizzle_migrations.created_at`.
 *
 * This intentionally reads migration metadata the same way Drizzle's migrate()
 * does so the check is consistent with what migrate() will actually apply.
 */
export function hasPendingMigrations(
  conn: Database.Database,
  migrationsFolder: string = MIGRATIONS_FOLDER,
): boolean {
  // Read migration files the same way drizzle-orm does.
  const migrations = readMigrationFiles({ migrationsFolder });

  if (migrations.length === 0) return false;

  // Ensure the migration tracking table exists so the query does not throw.
  // This mirrors what the Drizzle dialect does before reading.
  conn.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )
  `);

  // The Drizzle dialect considers a migration "applied" when its folderMillis
  // is <= the most recent created_at in the table.
  const row = conn
    .prepare(
      "SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1",
    )
    .get() as { id: number; hash: string; created_at: number } | undefined;

  if (!row) {
    // No migrations applied yet — every migration in the folder is pending.
    return true;
  }

  const lastApplied = Number(row.created_at);
  return migrations.some((m) => m.folderMillis > lastApplied);
}

// ---------------------------------------------------------------------------
// Pre-migration backup
// ---------------------------------------------------------------------------

/**
 * Write a copy of the database file to `data/backups/pre-migrate-<ts>.db`.
 * Uses the SQLite online backup API for a consistent copy.
 *
 * @returns The path of the backup file.
 */
export async function writePreMigrateBackup(
  conn: Database.Database,
  backupDir: string = defaultBackupDir(),
): Promise<string> {
  await mkdir(backupDir, { recursive: true });

  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, "-") // filesystem-safe
    .replace("Z", "");
  const backupPath = join(backupDir, `pre-migrate-${ts}.db`);
  await conn.backup(backupPath);
  return backupPath;
}

// ---------------------------------------------------------------------------
// Pragma verification
// ---------------------------------------------------------------------------

/**
 * Verify that the required D19 pragmas are active on the connection.
 * Throws if any pragma has an unexpected value.
 *
 * Pragma query results vary in key name — e.g. `busy_timeout` returns
 * `{ timeout: 5000 }`. We specify both the pragma name and the result
 * key explicitly.
 */
export function verifyPragmas(conn: Database.Database): void {
  const checks: Array<{ pragma: string; resultKey: string; want: string }> = [
    { pragma: "journal_mode", resultKey: "journal_mode", want: "wal" },
    { pragma: "synchronous", resultKey: "synchronous", want: "2" }, // FULL = 2
    { pragma: "foreign_keys", resultKey: "foreign_keys", want: "1" },
    { pragma: "busy_timeout", resultKey: "timeout", want: "5000" },
    { pragma: "temp_store", resultKey: "temp_store", want: "2" }, // MEMORY = 2
  ];

  for (const { pragma, resultKey, want } of checks) {
    const rows = conn.pragma(pragma) as Array<Record<string, unknown>>;
    const got = String(rows[0]?.[resultKey] ?? "").toLowerCase();
    if (got !== want) {
      throw new Error(
        `Pragma ${pragma}: expected ${want}, got ${got}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Startup sequence
// ---------------------------------------------------------------------------

export interface StartupResult {
  /** Whether migrations were applied during this startup. */
  migrated: boolean;
  /** Path to the pre-migration backup, if one was taken. */
  backupPath?: string;
}

/**
 * The full startup sequence (design D20):
 *
 * 1. Verify that the connection is usable and pragmas are correct.
 * 2. If migrations are pending, write a pre-migration backup.
 * 3. Apply migrations.
 * 4. On migration failure, log the error and exit non-zero (naming the backup).
 *
 * The caller (instrumentation.ts) starts the scheduler only on success.
 */
export async function runStartup(
  conn: Database.Database,
  options?: {
    migrationsFolder?: string;
    backupDir?: string;
    /** When true, throw instead of calling process.exit (for testing). */
    noExit?: boolean;
  },
): Promise<StartupResult> {
  const migrationsFolder = options?.migrationsFolder ?? MIGRATIONS_FOLDER;
  const backupDir = options?.backupDir ?? defaultBackupDir();

  // Step 1: verify pragmas
  verifyPragmas(conn);

  // Step 2: check for pending migrations
  const pending = hasPendingMigrations(conn, migrationsFolder);
  if (!pending) {
    return { migrated: false };
  }

  // Step 3: take a pre-migration backup
  let backupPath: string;
  try {
    backupPath = await writePreMigrateBackup(conn, backupDir);
  } catch (err) {
    const msg = `[startup] Failed to write pre-migration backup: ${err instanceof Error ? err.message : String(err)}`;
    console.error(msg);
    if (options?.noExit) {
      throw new Error(msg);
    }
    process.exit(1);
  }

  console.log(`[startup] Pre-migration backup written to ${backupPath}`);

  // Step 4: apply pending migrations
  try {
    const drizzleDb = drizzle(conn);
    migrate(drizzleDb, { migrationsFolder });
    console.log("[startup] Migrations applied successfully.");
    return { migrated: true, backupPath };
  } catch (err) {
    const msg =
      `[startup] Migration failed. ` +
      `Restore the pre-migration backup: ${backupPath}\n` +
      `Error: ${err instanceof Error ? err.message : String(err)}`;
    console.error(msg);
    if (options?.noExit) {
      throw new MigrationError(msg, backupPath);
    }
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// MigrationError (carries the backup path for callers / tests)
// ---------------------------------------------------------------------------

export class MigrationError extends Error {
  public readonly backupPath: string;
  constructor(message: string, backupPath: string) {
    super(message);
    this.name = "MigrationError";
    this.backupPath = backupPath;
  }
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let _shutdownRegistered = false;

/**
 * Register SIGTERM and SIGINT handlers that:
 * 1. Stop the scheduler (clear the interval, await in-progress tick).
 * 2. Close the database connection (checkpoints the WAL).
 *
 * Handlers are registered at most once per process. Subsequent calls are
 * no-ops.
 *
 * @param conn The database connection to close on shutdown.
 * @returns A `shutdown()` function that can be called directly (for tests).
 */
export function registerShutdown(conn: Database.Database): () => Promise<void> {
  const shutdown = async (): Promise<void> => {
    console.log("[shutdown] Stopping scheduler…");
    await stopScheduler();
    console.log("[shutdown] Closing database…");
    if (conn.open) {
      conn.close();
    }
    console.log("[shutdown] Done.");
  };

  if (!_shutdownRegistered) {
    _shutdownRegistered = true;
    const handler = () => {
      shutdown().then(
        () => process.exit(0),
        (err) => {
          console.error("[shutdown] Error during shutdown:", err);
          process.exit(1);
        },
      );
    };
    process.on("SIGTERM", handler);
    process.on("SIGINT", handler);
  }

  return shutdown;
}

/** Reset the shutdown-registered flag (test-only). */
export function _resetShutdownFlag(): void {
  _shutdownRegistered = false;
}
