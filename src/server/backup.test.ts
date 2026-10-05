/**
 * Tests for the backup / retention / restore logic (task 4.2).
 *
 * All tests use temporary file-system directories; they never touch the
 * production data/ directory.
 */

import Database from "better-sqlite3";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  backupDatabase,
  applyRetention,
  restoreDatabase,
} from "./backup";

// ---------------------------------------------------------------------------
// Temp-directory lifecycle
// ---------------------------------------------------------------------------

const tmpdirs: string[] = [];

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "hearth-backup-test-"));
  tmpdirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpdirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tmpdirs.length = 0;
});

// ---------------------------------------------------------------------------
// Helper: open a small test DB and insert some rows
// ---------------------------------------------------------------------------

function makeTestDb(dir: string, filename = "test.db"): Database.Database {
  const conn = new Database(join(dir, filename));
  conn.exec(`
    CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    INSERT INTO items VALUES (1, 'apple');
    INSERT INTO items VALUES (2, 'banana');
  `);
  return conn;
}

// ---------------------------------------------------------------------------
// backupDatabase — file created, data intact, integrity_check passes
// ---------------------------------------------------------------------------

describe("backupDatabase", () => {
  it("creates a backup file with the date in the name", async () => {
    const srcDir = makeTmpDir();
    const backupDir = makeTmpDir();
    const conn = makeTestDb(srcDir);

    const now = new Date("2025-06-15T14:00:00Z");
    const backupPath = await backupDatabase(conn, now, backupDir);

    conn.close();

    expect(backupPath).toBe(join(backupDir, "hearth-2025-06-15.db"));
    expect(existsSync(backupPath)).toBe(true);
  });

  it("the backup opens as a valid SQLite database", async () => {
    const srcDir = makeTmpDir();
    const backupDir = makeTmpDir();
    const conn = makeTestDb(srcDir);

    const backupPath = await backupDatabase(conn, new Date(), backupDir);
    conn.close();

    // Open the backup with a fresh connection — should work without error
    const copy = new Database(backupPath, { readonly: true });
    expect(() => copy.prepare("SELECT 1").get()).not.toThrow();
    copy.close();
  });

  it("PRAGMA integrity_check passes on the backup copy", async () => {
    const srcDir = makeTmpDir();
    const backupDir = makeTmpDir();
    const conn = makeTestDb(srcDir);

    const backupPath = await backupDatabase(conn, new Date(), backupDir);
    conn.close();

    const copy = new Database(backupPath, { readonly: true });
    const rows = copy.pragma("integrity_check") as Array<{
      integrity_check: string;
    }>;
    copy.close();

    expect(rows).toHaveLength(1);
    expect(rows[0].integrity_check).toBe("ok");
  });

  it("the backup contains the data that was in the source DB at backup time", async () => {
    const srcDir = makeTmpDir();
    const backupDir = makeTmpDir();
    const conn = makeTestDb(srcDir);

    const backupPath = await backupDatabase(conn, new Date(), backupDir);
    conn.close();

    const copy = new Database(backupPath, { readonly: true });
    const rows = copy.prepare("SELECT * FROM items ORDER BY id").all() as Array<{
      id: number;
      name: string;
    }>;
    copy.close();

    expect(rows).toEqual([
      { id: 1, name: "apple" },
      { id: 2, name: "banana" },
    ]);
  });

  it("overwrites an existing backup for the same date", async () => {
    const srcDir = makeTmpDir();
    const backupDir = makeTmpDir();
    const conn = makeTestDb(srcDir);
    const now = new Date("2025-06-15T14:00:00Z");

    // First backup
    const path1 = await backupDatabase(conn, now, backupDir);
    // Add a row and back up again — same date
    conn.exec("INSERT INTO items VALUES (3, 'cherry')");
    const path2 = await backupDatabase(conn, now, backupDir);
    conn.close();

    expect(path1).toBe(path2);

    // The second backup should contain the new row
    const copy = new Database(path2, { readonly: true });
    const count = (
      copy.prepare("SELECT count(*) AS n FROM items").get() as { n: number }
    ).n;
    copy.close();

    expect(count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// applyRetention — keeps 7 daily + 4 weekly, deletes the rest
// ---------------------------------------------------------------------------

describe("applyRetention", () => {
  /** Create empty placeholder backup files in `dir` for each given date. */
  function touchBackups(dir: string, dates: string[]): void {
    for (const d of dates) {
      writeFileSync(join(dir, `hearth-${d}.db`), "");
    }
  }

  it("does not delete anything when there are 7 or fewer files", async () => {
    const dir = makeTmpDir();
    const dates = [
      "2025-01-07",
      "2025-01-06",
      "2025-01-05",
      "2025-01-04",
      "2025-01-03",
      "2025-01-02",
      "2025-01-01",
    ];
    touchBackups(dir, dates);

    await applyRetention(dir);

    for (const d of dates) {
      expect(existsSync(join(dir, `hearth-${d}.db`)), `${d} should exist`).toBe(
        true,
      );
    }
  });

  it("keeps the 7 most recent daily files and deletes the 8th oldest", async () => {
    const dir = makeTmpDir();
    // 8 consecutive daily files in the same ISO week (2025-W03)
    const dates = [
      "2025-01-15", // newest — keep (daily 1)
      "2025-01-14", // keep (daily 2)
      "2025-01-13", // keep (daily 3)
      "2025-01-12", // keep (daily 4)
      "2025-01-11", // keep (daily 5)
      "2025-01-10", // keep (daily 6)
      "2025-01-09", // keep (daily 7)
      "2025-01-08", // 8th oldest — should be deleted (same week, not a weekly pick)
    ];
    touchBackups(dir, dates);

    await applyRetention(dir);

    // First 7 survive
    for (const d of dates.slice(0, 7)) {
      expect(existsSync(join(dir, `hearth-${d}.db`)), `${d} should exist`).toBe(
        true,
      );
    }
    // 8th is gone
    expect(existsSync(join(dir, "hearth-2025-01-08.db"))).toBe(false);
  });

  it("keeps 4 weekly checkpoints beyond the 7 daily window", async () => {
    const dir = makeTmpDir();
    //
    // Layout (newest first):
    //   2025-01-15  W03  daily keep 1   weekly keep W03
    //   2025-01-14  W03  daily keep 2
    //   2025-01-13  W03  daily keep 3
    //   2025-01-10  W02  daily keep 4   weekly keep W02
    //   2025-01-09  W02  daily keep 5
    //   2025-01-08  W02  daily keep 6
    //   2025-01-07  W02  daily keep 7
    //   2025-01-06  W02  NOT in daily    same week as W02 weekly (covered by item 4)
    //   2025-01-01  W01  weekly keep W01
    //   2024-12-25  W52  weekly keep W52
    //   2024-12-18  W51  5th weekly → DELETE
    //   2024-12-11  W50  6th weekly → DELETE
    //
    const dates = [
      "2025-01-15",
      "2025-01-14",
      "2025-01-13",
      "2025-01-10",
      "2025-01-09",
      "2025-01-08",
      "2025-01-07",
      "2025-01-06",
      "2025-01-01",
      "2024-12-25",
      "2024-12-18",
      "2024-12-11",
    ];
    touchBackups(dir, dates);

    await applyRetention(dir);

    const shouldExist = new Set([
      "2025-01-15",
      "2025-01-14",
      "2025-01-13",
      "2025-01-10",
      "2025-01-09",
      "2025-01-08",
      "2025-01-07",
      // 2025-01-06 is the 8th daily AND is in W02, but W02's representative
      // is 2025-01-10, so 2025-01-06 is NOT kept
      "2025-01-01", // W01 weekly checkpoint
      "2024-12-25", // W52 weekly checkpoint
      // 2024-12-18 W51 = 5th week → deleted
      // 2024-12-11 W50 = 6th week → deleted
    ]);

    for (const d of dates) {
      const path = join(dir, `hearth-${d}.db`);
      expect(
        existsSync(path),
        `${d} should ${shouldExist.has(d) ? "exist" : "be deleted"}`,
      ).toBe(shouldExist.has(d));
    }
  });

  it(
    "a file that qualifies as both daily and weekly is not double-deleted",
    async () => {
      const dir = makeTmpDir();
      // Only 4 files, spread across 4 different weeks.
      // All 4 are in "daily" keep and also in "weekly" keep.
      const dates = [
        "2025-01-15", // W03 — daily 1, weekly W03
        "2025-01-08", // W02 — daily 2, weekly W02
        "2025-01-01", // W01 — daily 3, weekly W01
        "2024-12-25", // W52 — daily 4, weekly W52
      ];
      touchBackups(dir, dates);

      await applyRetention(dir);

      for (const d of dates) {
        expect(
          existsSync(join(dir, `hearth-${d}.db`)),
          `${d} should exist (both daily + weekly keep)`,
        ).toBe(true);
      }
    },
  );

  it("ignores files that do not match the backup filename pattern", async () => {
    const dir = makeTmpDir();
    // One valid backup + one unrelated file
    touchBackups(dir, ["2025-01-15"]);
    writeFileSync(join(dir, "pre-migrate-20250101-120000.db"), "");
    writeFileSync(join(dir, "some-other-file.txt"), "");

    await applyRetention(dir);

    // Valid backup still there, unrelated files untouched
    expect(existsSync(join(dir, "hearth-2025-01-15.db"))).toBe(true);
    expect(existsSync(join(dir, "pre-migrate-20250101-120000.db"))).toBe(true);
    expect(existsSync(join(dir, "some-other-file.txt"))).toBe(true);
  });

  it("returns without error when the backup directory does not exist", async () => {
    const dir = join(makeTmpDir(), "nonexistent");
    await expect(applyRetention(dir)).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// restoreDatabase — copies backup over destination, cleans WAL/SHM
// ---------------------------------------------------------------------------

describe("restoreDatabase", () => {
  it("the restored file contains the backed-up data", async () => {
    const srcDir = makeTmpDir();
    const backupDir = makeTmpDir();
    const destDir = makeTmpDir();

    const conn = makeTestDb(srcDir);
    const backupPath = await backupDatabase(conn, new Date(), backupDir);
    conn.close();

    const destPath = join(destDir, "hearth.db");
    await restoreDatabase(backupPath, destPath);

    const restored = new Database(destPath, { readonly: true });
    const rows = restored
      .prepare("SELECT * FROM items ORDER BY id")
      .all() as Array<{ id: number; name: string }>;
    restored.close();

    expect(rows).toEqual([
      { id: 1, name: "apple" },
      { id: 2, name: "banana" },
    ]);
  });

  it("removes existing WAL and SHM sidecars after restoring", async () => {
    const srcDir = makeTmpDir();
    const backupDir = makeTmpDir();
    const destDir = makeTmpDir();

    const conn = makeTestDb(srcDir);
    const backupPath = await backupDatabase(conn, new Date(), backupDir);
    conn.close();

    const destPath = join(destDir, "hearth.db");
    // Create fake WAL and SHM sidecars at the destination
    writeFileSync(`${destPath}-wal`, "fake-wal");
    writeFileSync(`${destPath}-shm`, "fake-shm");

    await restoreDatabase(backupPath, destPath);

    expect(existsSync(`${destPath}-wal`)).toBe(false);
    expect(existsSync(`${destPath}-shm`)).toBe(false);
  });

  it("round-trip: backup → restore → data matches original", async () => {
    const srcDir = makeTmpDir();
    const backupDir = makeTmpDir();
    const restoreDir = makeTmpDir();

    // Create source DB with data
    const conn = makeTestDb(srcDir);
    conn.exec("INSERT INTO items VALUES (3, 'cherry')");

    // Backup
    const backupPath = await backupDatabase(conn, new Date(), backupDir);
    conn.close();

    // Restore into a fresh location
    const restorePath = join(restoreDir, "hearth.db");
    await restoreDatabase(backupPath, restorePath);

    // Verify restored data
    const restoredConn = new Database(restorePath, { readonly: true });
    const rows = restoredConn
      .prepare("SELECT * FROM items ORDER BY id")
      .all() as Array<{ id: number; name: string }>;
    restoredConn.close();

    expect(rows).toEqual([
      { id: 1, name: "apple" },
      { id: 2, name: "banana" },
      { id: 3, name: "cherry" },
    ]);
  });

  it("creates the destination directory if it does not exist", async () => {
    const srcDir = makeTmpDir();
    const backupDir = makeTmpDir();
    const parentDir = makeTmpDir();

    const conn = makeTestDb(srcDir);
    const backupPath = await backupDatabase(conn, new Date(), backupDir);
    conn.close();

    const destPath = join(parentDir, "nested", "deeply", "hearth.db");
    await expect(restoreDatabase(backupPath, destPath)).resolves.not.toThrow();
    expect(existsSync(destPath)).toBe(true);
  });
});
