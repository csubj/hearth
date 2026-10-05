/**
 * CLI entry points for `pnpm db:backup` and `pnpm db:restore <file>`
 * (design D20, task 4.2).
 *
 * Usage (via package.json scripts):
 *   pnpm db:backup                     → tsx backup-cli.ts backup
 *   pnpm db:restore <backup-file>      → tsx backup-cli.ts restore <file>
 *
 * Direct usage:
 *   tsx src/server/backup-cli.ts backup
 *   tsx src/server/backup-cli.ts restore data/backups/hearth-2025-01-15.db
 */

import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  backupDatabase,
  applyRetention,
  restoreDatabase,
  defaultBackupDir,
  defaultDbPath,
} from "./backup";

const command = process.argv[2];

// ---------------------------------------------------------------------------
// backup command
// ---------------------------------------------------------------------------

async function runBackup(): Promise<void> {
  const { sqlite } = await import("../db");
  const backupPath = await backupDatabase(sqlite);
  await applyRetention(defaultBackupDir());
  console.log(`✓ backup written and verified: ${backupPath}`);
}

// ---------------------------------------------------------------------------
// restore command
// ---------------------------------------------------------------------------

/**
 * Attempt to detect whether the production database is held open by a running
 * app process. Uses `BEGIN EXCLUSIVE` as a lock probe — SQLite returns
 * SQLITE_BUSY if another connection is open.
 *
 * This is a best-effort check; it exits non-zero when a lock is detected so
 * operators are alerted, but it cannot guarantee the app is not running.
 * Always stop the app before running `pnpm db:restore`.
 */
function checkNotRunning(dbPath: string): void {
  if (!existsSync(dbPath)) return; // Nothing there yet — OK to restore

  let conn: Database.Database | null = null;
  try {
    conn = new Database(dbPath);
    // BEGIN EXCLUSIVE acquires a write lock; it fails with SQLITE_BUSY when
    // another connection (the running app) already holds the database.
    conn.exec("BEGIN EXCLUSIVE; ROLLBACK;");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/SQLITE_BUSY|database is locked/i.test(msg)) {
      console.error(
        "ERROR: The database is locked — the app appears to be running.\n" +
          "       Stop the app before running pnpm db:restore.",
      );
      process.exit(1);
    }
    // Other errors (e.g. corrupt DB, missing file) — proceed so restore can fix it
  } finally {
    conn?.close();
  }
}

async function runRestore(backupFile: string): Promise<void> {
  const destPath = defaultDbPath();
  checkNotRunning(destPath);

  const resolvedBackup = resolve(backupFile);
  await restoreDatabase(resolvedBackup, destPath);

  console.log(`✓ restored: ${resolvedBackup} → ${destPath}`);
  console.log(
    "  NOTE: attachment files in data/uploads are not part of the database",
  );
  console.log(
    "  backup. Restore data/uploads separately if needed, then start the app.",
  );
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  switch (command) {
    case "backup":
      await runBackup();
      break;

    case "restore": {
      const backupFile = process.argv[3];
      if (!backupFile) {
        console.error("Usage: pnpm db:restore <backup-file>");
        process.exit(1);
      }
      await runRestore(backupFile);
      break;
    }

    default:
      console.error(
        "Usage:\n" +
          "  pnpm db:backup\n" +
          "  pnpm db:restore <backup-file>",
      );
      process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(
      "✗ error:",
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  });
