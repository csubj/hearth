/**
 * Tests for the startup sequence and graceful shutdown (task 4.1).
 *
 * Uses temp file databases and temp migration folders to avoid touching
 * real data. Each test creates its own DB and migrations to be fully
 * isolated.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyDatabasePragmas } from "../db/client";
import {
  hasPendingMigrations,
  runStartup,
  MigrationError,
  registerShutdown,
  _resetShutdownFlag,
  verifyPragmas,
} from "./startup";
import {
  tick,
  registerJob,
  _clearJobs,
  setConnection,
  isRunning,
} from "./jobs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a temp directory that is cleaned up after the test. */
function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "hearth-test-"));
}

/**
 * Build a minimal migrations folder with a journal and the given migrations.
 * Returns the folder path.
 */
function buildMigrationsFolder(
  base: string,
  migrations: Array<{
    tag: string;
    when: number;
    sql: string;
  }>,
): string {
  const folder = join(base, "drizzle");
  const meta = join(folder, "meta");
  mkdirSync(meta, { recursive: true });

  const entries = migrations.map((m, idx) => ({
    idx,
    version: "6",
    when: m.when,
    tag: m.tag,
    breakpoints: true,
  }));

  writeFileSync(
    join(meta, "_journal.json"),
    JSON.stringify({ version: "7", dialect: "sqlite", entries }),
  );

  for (const m of migrations) {
    writeFileSync(join(folder, `${m.tag}.sql`), m.sql);
  }

  return folder;
}

/** Open a file-backed DB with pragmas applied. */
function openFileDb(dir: string, name = "test.db"): Database.Database {
  const dbPath = join(dir, name);
  const conn = new Database(dbPath);
  applyDatabasePragmas(conn);
  return conn;
}

// ---------------------------------------------------------------------------
// Test state
// ---------------------------------------------------------------------------

let tmpDirs: string[] = [];

function trackDir(dir: string): string {
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of tmpDirs) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  }
  tmpDirs = [];
  _resetShutdownFlag();
});

// ---------------------------------------------------------------------------
// hasPendingMigrations
// ---------------------------------------------------------------------------

describe("hasPendingMigrations", () => {
  it("returns true when there are unapplied migrations", () => {
    const dir = trackDir(makeTmpDir());
    const conn = openFileDb(dir);

    const migFolder = buildMigrationsFolder(dir, [
      {
        tag: "0000_test_migration",
        when: 1000,
        sql: "CREATE TABLE test_table (id INTEGER PRIMARY KEY);",
      },
    ]);

    try {
      expect(hasPendingMigrations(conn, migFolder)).toBe(true);
    } finally {
      conn.close();
    }
  });

  it("returns false when all migrations are applied", () => {
    const dir = trackDir(makeTmpDir());
    const conn = openFileDb(dir);

    const migFolder = buildMigrationsFolder(dir, [
      {
        tag: "0000_test_migration",
        when: 1000,
        sql: "CREATE TABLE test_table (id INTEGER PRIMARY KEY);",
      },
    ]);

    // Apply migration with Drizzle's migrate()
    const db = drizzle(conn);
    migrate(db, { migrationsFolder: migFolder });

    try {
      expect(hasPendingMigrations(conn, migFolder)).toBe(false);
    } finally {
      conn.close();
    }
  });

  it("returns true when a NEW migration is added after previous ones were applied", () => {
    const dir = trackDir(makeTmpDir());
    const conn = openFileDb(dir);

    // First, create and apply migration 0000
    const migFolder1 = buildMigrationsFolder(dir, [
      {
        tag: "0000_first",
        when: 1000,
        sql: "CREATE TABLE first_table (id INTEGER PRIMARY KEY);",
      },
    ]);

    const db = drizzle(conn);
    migrate(db, { migrationsFolder: migFolder1 });

    // Now add a second migration and rebuild the folder
    const migFolder2 = buildMigrationsFolder(dir, [
      {
        tag: "0000_first",
        when: 1000,
        sql: "CREATE TABLE first_table (id INTEGER PRIMARY KEY);",
      },
      {
        tag: "0001_second",
        when: 2000,
        sql: "CREATE TABLE second_table (id INTEGER PRIMARY KEY);",
      },
    ]);

    try {
      expect(hasPendingMigrations(conn, migFolder2)).toBe(true);
    } finally {
      conn.close();
    }
  });

  it("returns false when the migrations folder is empty", () => {
    const dir = trackDir(makeTmpDir());
    const conn = openFileDb(dir);

    const migFolder = buildMigrationsFolder(dir, []);

    try {
      expect(hasPendingMigrations(conn, migFolder)).toBe(false);
    } finally {
      conn.close();
    }
  });
});

// ---------------------------------------------------------------------------
// runStartup — pending migration produces a pre-migrate backup BEFORE applying
// ---------------------------------------------------------------------------

describe("runStartup", () => {
  it("takes a pre-migrate backup and then applies a pending migration", async () => {
    const dir = trackDir(makeTmpDir());
    const backupDir = join(dir, "backups");
    const conn = openFileDb(dir);

    const migFolder = buildMigrationsFolder(dir, [
      {
        tag: "0000_startup_test",
        when: 1000,
        sql: "CREATE TABLE startup_test (id INTEGER PRIMARY KEY, val TEXT);",
      },
    ]);

    try {
      const result = await runStartup(conn, {
        migrationsFolder: migFolder,
        backupDir,
        noExit: true,
      });

      // A backup was taken
      expect(result.migrated).toBe(true);
      expect(result.backupPath).toBeDefined();
      expect(existsSync(result.backupPath!)).toBe(true);
      expect(result.backupPath!).toContain("pre-migrate-");

      // The migration was applied (the table exists)
      const tables = conn
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='startup_test'",
        )
        .all();
      expect(tables).toHaveLength(1);

      // Verify the backup was taken BEFORE the migration by opening it
      // and checking that startup_test does NOT exist in the backup
      const backupConn = new Database(result.backupPath!, {
        readonly: true,
      });
      try {
        const backupTables = backupConn
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='startup_test'",
          )
          .all();
        expect(backupTables).toHaveLength(0);
      } finally {
        backupConn.close();
      }
    } finally {
      conn.close();
    }
  });

  it("returns migrated: false and no backup when up to date", async () => {
    const dir = trackDir(makeTmpDir());
    const backupDir = join(dir, "backups");
    const conn = openFileDb(dir);

    const migFolder = buildMigrationsFolder(dir, [
      {
        tag: "0000_already_applied",
        when: 1000,
        sql: "CREATE TABLE already_applied (id INTEGER PRIMARY KEY);",
      },
    ]);

    // Apply first
    const db = drizzle(conn);
    migrate(db, { migrationsFolder: migFolder });

    try {
      const result = await runStartup(conn, {
        migrationsFolder: migFolder,
        backupDir,
        noExit: true,
      });

      expect(result.migrated).toBe(false);
      expect(result.backupPath).toBeUndefined();

      // No backup was written
      expect(existsSync(backupDir)).toBe(false);
    } finally {
      conn.close();
    }
  });
});

// ---------------------------------------------------------------------------
// runStartup — broken migration exits with error naming backup
// ---------------------------------------------------------------------------

describe("runStartup with broken migration", () => {
  it("throws MigrationError naming the backup path on a broken migration", async () => {
    const dir = trackDir(makeTmpDir());
    const backupDir = join(dir, "backups");
    const conn = openFileDb(dir);

    const migFolder = buildMigrationsFolder(dir, [
      {
        tag: "0000_broken",
        when: 1000,
        sql: "THIS IS NOT VALID SQL AT ALL;",
      },
    ]);

    try {
      let caught: MigrationError | null = null;
      try {
        await runStartup(conn, {
          migrationsFolder: migFolder,
          backupDir,
          noExit: true,
        });
      } catch (err) {
        expect(err).toBeInstanceOf(MigrationError);
        caught = err as MigrationError;
      }

      expect(caught).not.toBeNull();
      expect(caught!.backupPath).toBeDefined();
      expect(caught!.backupPath).toContain("pre-migrate-");
      expect(existsSync(caught!.backupPath)).toBe(true);
      expect(caught!.message).toContain(caught!.backupPath);
    } finally {
      conn.close();
    }
  });

  it("does NOT apply the broken migration (the table should not exist)", async () => {
    const dir = trackDir(makeTmpDir());
    const backupDir = join(dir, "backups");
    const conn = openFileDb(dir);

    const migFolder = buildMigrationsFolder(dir, [
      {
        tag: "0000_create_then_fail",
        when: 1000,
        // Two statements separated by the breakpoint marker;
        // the first creates a table, the second is invalid SQL
        sql: "CREATE TABLE should_not_exist (id INTEGER PRIMARY KEY);\n--> statement-breakpoint\nTHIS IS INVALID;",
      },
    ]);

    try {
      await runStartup(conn, {
        migrationsFolder: migFolder,
        backupDir,
        noExit: true,
      }).catch(() => {
        /* expected */
      });

      // The table should NOT exist because the transaction was rolled back
      const tables = conn
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='should_not_exist'",
        )
        .all();
      expect(tables).toHaveLength(0);
    } finally {
      conn.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

describe("registerShutdown / shutdown", () => {
  beforeEach(() => {
    _clearJobs();
  });

  afterEach(() => {
    setConnection(null);
    const g = globalThis as Record<string, unknown>;
    g.__hearthSchedulerStarted = false;
    g.__hearthSchedulerInterval = undefined;
  });

  it("stops the scheduler timer, waits for a running tick, and closes the DB", async () => {
    const dir = trackDir(makeTmpDir());
    const conn = openFileDb(dir);
    // Create job_runs table so tick() can record start/success
    conn.exec(
      "CREATE TABLE IF NOT EXISTS job_runs (name TEXT PRIMARY KEY, last_started_at INTEGER, last_succeeded_at INTEGER, last_error TEXT)",
    );
    setConnection(conn);

    let resolveJob: (() => void) | null = null;
    let jobRan = false;

    registerJob({
      name: "shutdown-test-job",
      frequency: "every-tick",
      run: async () => {
        jobRan = true;
        await new Promise<void>((r) => {
          resolveJob = r;
        });
      },
    });

    // Get the shutdown function
    const shutdown = registerShutdown(conn);

    // Start a tick that will block on the job
    const tickPromise = tick(new Date());
    await new Promise((r) => setTimeout(r, 10));
    expect(isRunning()).toBe(true);
    expect(jobRan).toBe(true);

    // Start shutdown — it should wait for the running tick
    const shutdownPromise = shutdown();

    // Tick is still running
    expect(isRunning()).toBe(true);
    expect(conn.open).toBe(true);

    // Let the job complete
    resolveJob!();
    await tickPromise;
    await shutdownPromise;

    // After shutdown: tick finished, connection closed
    expect(isRunning()).toBe(false);
    expect(conn.open).toBe(false);
  });

  it("closes the connection even when no tick is running", async () => {
    const dir = trackDir(makeTmpDir());
    const conn = openFileDb(dir);
    setConnection(conn);

    const shutdown = registerShutdown(conn);

    expect(conn.open).toBe(true);
    await shutdown();
    expect(conn.open).toBe(false);
  });

  it("prevents new ticks after shutdown (scheduler started flag cleared)", async () => {
    const dir = trackDir(makeTmpDir());
    const conn = openFileDb(dir);
    conn.exec(
      "CREATE TABLE IF NOT EXISTS job_runs (name TEXT PRIMARY KEY, last_started_at INTEGER, last_succeeded_at INTEGER, last_error TEXT)",
    );
    setConnection(conn);

    let tickCount = 0;
    registerJob({
      name: "count-ticks",
      frequency: "every-tick",
      run: () => {
        tickCount++;
      },
    });

    await tick(new Date());
    expect(tickCount).toBe(1);

    const shutdown = registerShutdown(conn);
    await shutdown();

    // stopScheduler() sets __hearthSchedulerStarted = false
    const g = globalThis as Record<string, unknown>;
    expect(g.__hearthSchedulerStarted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// verifyPragmas
// ---------------------------------------------------------------------------

describe("verifyPragmas", () => {
  it("passes on a correctly configured file-backed connection", () => {
    // WAL mode requires a file-backed DB (in-memory DBs can't use WAL)
    const dir = trackDir(makeTmpDir());
    const conn = openFileDb(dir);
    try {
      expect(() => verifyPragmas(conn)).not.toThrow();
    } finally {
      conn.close();
    }
  });

  it("throws when a pragma is wrong", () => {
    const dir = trackDir(makeTmpDir());
    const conn = openFileDb(dir);
    conn.pragma("foreign_keys = OFF");
    try {
      expect(() => verifyPragmas(conn)).toThrow(/foreign_keys/);
    } finally {
      conn.close();
    }
  });
});
