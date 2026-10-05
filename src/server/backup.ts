/**
 * Daily online backup, retention management, and restore (design D20, task 4.2).
 *
 * Three exported functions:
 *   backupDatabase  – write data/backups/hearth-<date>.db and verify with
 *                     PRAGMA integrity_check on the copy.
 *   applyRetention  – keep 7 most recent daily + 4 most recent weekly files,
 *                     delete everything else.
 *   restoreDatabase – copy a backup file onto data/hearth.db (app must be
 *                     stopped); removes WAL/SHM sidecars so the DB starts clean.
 */

import Database from "better-sqlite3";
import { mkdir, copyFile, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Default backup directory relative to CWD (data/backups). */
export function defaultBackupDir(): string {
  return join(process.cwd(), "data", "backups");
}

/** Default production database path relative to CWD (data/hearth.db). */
export function defaultDbPath(): string {
  return join(process.cwd(), "data", "hearth.db");
}

// ---------------------------------------------------------------------------
// ISO week key (e.g. "2025-W03") — no external dependency
// ---------------------------------------------------------------------------

/**
 * Return the ISO 8601 year-week string (e.g. "2025-W03") for a given Date.
 * Dates are evaluated in UTC to avoid DST artifacts on calendar boundaries.
 */
function isoWeekKey(date: Date): string {
  // Work in UTC: normalise to midnight
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  // ISO day-of-week: Mon=1 … Sun=7
  const dow = d.getUTCDay() || 7;
  // Shift to Thursday of this ISO week (the anchor day that defines the year)
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// backupDatabase
// ---------------------------------------------------------------------------

/**
 * Create a consistent online backup of the database to
 * `<backupDir>/hearth-<YYYY-MM-DD>.db` using better-sqlite3's `db.backup()`,
 * then verify the copy with `PRAGMA integrity_check`.
 *
 * If a backup file for today already exists it is overwritten so the daily
 * file always reflects the most recent state.
 *
 * @param conn      The better-sqlite3 connection to back up.
 *                  Omit to use the production singleton from `src/db`.
 * @param now       The current time — determines the date in the filename.
 *                  Defaults to `new Date()`.
 * @param backupDir Directory to write the backup into.
 *                  Defaults to `data/backups` relative to CWD.
 * @returns         The absolute path of the written backup file.
 * @throws          If the backup's integrity check fails.
 */
export async function backupDatabase(
  conn?: Database.Database,
  now: Date = new Date(),
  backupDir: string = defaultBackupDir(),
): Promise<string> {
  // Lazy-import the production singleton only when no connection is provided
  const db = conn ?? (await import("../db")).sqlite;

  await mkdir(backupDir, { recursive: true });

  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const destPath = join(backupDir, `hearth-${dateStr}.db`);

  // better-sqlite3 online backup (SQLite Online Backup API) — consistent
  // even with concurrent reads; resolves when the copy is complete.
  await db.backup(destPath);

  // Verify the copy with PRAGMA integrity_check on a read-only connection
  const copy = new Database(destPath, { readonly: true });
  try {
    const rows = copy.pragma("integrity_check") as Array<{
      integrity_check: string;
    }>;
    if (!rows.length || rows[0].integrity_check !== "ok") {
      throw new Error(
        `Backup integrity check failed for ${destPath}: ${JSON.stringify(rows)}`,
      );
    }
  } finally {
    copy.close();
  }

  return destPath;
}

// ---------------------------------------------------------------------------
// applyRetention
// ---------------------------------------------------------------------------

/**
 * Apply the 7-daily + 4-weekly retention policy to `backupDir`.
 *
 * Rules:
 * - Keep the 7 most recent backup files (by date in the filename).
 * - Keep the most recent backup file for each of the 4 most recent ISO weeks.
 * - A file that qualifies under both rules is kept (never double-deleted).
 * - All other matching files (`hearth-YYYY-MM-DD.db`) are deleted.
 * - Non-matching files in the directory are left untouched.
 *
 * @param backupDir The directory containing backup files.
 *                  If the directory does not exist, the function returns
 *                  without error.
 */
export async function applyRetention(backupDir: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(backupDir);
  } catch {
    // Directory doesn't exist — nothing to do
    return;
  }

  interface BackupEntry {
    name: string;
    date: string; // YYYY-MM-DD (sortable)
    week: string; // YYYY-Www
  }

  // Collect files that match the backup filename pattern
  const backups: BackupEntry[] = [];
  for (const name of entries) {
    const m = /^hearth-(\d{4}-\d{2}-\d{2})\.db$/.exec(name);
    if (!m) continue;
    const date = m[1];
    backups.push({
      name,
      date,
      week: isoWeekKey(new Date(`${date}T00:00:00Z`)),
    });
  }

  if (backups.length === 0) return;

  // Sort newest first so "first 7" = 7 most recent
  backups.sort((a, b) => b.date.localeCompare(a.date));

  const keep = new Set<string>();

  // Daily: keep the 7 newest files
  for (const entry of backups.slice(0, 7)) {
    keep.add(entry.name);
  }

  // Weekly: keep the most recent file per ISO week for the 4 newest weeks.
  // Iterate in sorted (newest-first) order so each week's first hit is its
  // most recent file; stop after 4 distinct weeks.
  const weeksSeen = new Map<string, string>(); // week key → newest file in that week
  for (const entry of backups) {
    if (!weeksSeen.has(entry.week)) {
      weeksSeen.set(entry.week, entry.name);
    }
  }
  let weekCount = 0;
  for (const name of weeksSeen.values()) {
    if (weekCount >= 4) break;
    keep.add(name);
    weekCount++;
  }

  // Delete every matched file not in the keep set
  await Promise.all(
    backups
      .filter((e) => !keep.has(e.name))
      .map((e) => unlink(join(backupDir, e.name))),
  );
}

// ---------------------------------------------------------------------------
// restoreDatabase
// ---------------------------------------------------------------------------

/**
 * Replace the production database with a backup file.
 *
 * **IMPORTANT — the app must be stopped before calling this function.**
 * Running a restore while the app is active can corrupt the database.
 *
 * After copying, any existing WAL (`-wal`) and SHM (`-shm`) sidecar files at
 * the destination are removed so the restored database starts in a clean state.
 *
 * Attachment files in `data/uploads` are not part of the database backup.
 * To restore attachments, copy your `data/uploads` backup directory into
 * place before restarting the app.
 *
 * @param backupFile Path to the `.db` backup file to restore.
 * @param destPath   Destination database file path.
 *                   Defaults to `data/hearth.db` relative to CWD.
 */
export async function restoreDatabase(
  backupFile: string,
  destPath: string = defaultDbPath(),
): Promise<void> {
  // Ensure the destination directory exists (data/ is usually present, but be safe)
  await mkdir(dirname(destPath), { recursive: true });

  // Overwrite the production database with the backup
  await copyFile(backupFile, destPath);

  // Remove WAL and SHM sidecars — they are no longer valid for the restored DB
  for (const sidecar of [`${destPath}-wal`, `${destPath}-shm`]) {
    if (existsSync(sidecar)) {
      await unlink(sidecar);
    }
  }
}
