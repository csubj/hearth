/**
 * Restore drill (design D20, task 14.4).
 *
 * Seeds a database, takes an online backup, restores that backup into a
 * *fresh*, empty data directory, opens the restored database, and asserts the
 * data matches the seeded source (counts per table and row equality).
 *
 * This mirrors the documented operator procedure (seed → backup → stop →
 * restore into a fresh `data/` → start) headlessly: no browser, no running
 * server, no shared global state.
 */

import { vi, describe, it, expect, beforeAll } from "vitest";

const state = vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "hearth-restore-"));
  const dbPath = join(dir, "hearth.db");
  process.env.DATABASE_URL = "file:" + dbPath;
  return { dir, dbPath };
});

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, sqlite } from "../db";
import { MIGRATIONS_FOLDER } from "../db/testing";
import { seedDatabase } from "./seed";
import { backupDatabase, restoreDatabase } from "./backup";

let backupDir: string;
let restoredDir: string;

beforeAll(() => {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  backupDir = join(state.dir, "backups");
  restoredDir = join(state.dir, "restored");
  mkdirSync(restoredDir, { recursive: true });

  seedDatabase(sqlite, {
    entities: 200,
    places: 50,
    activity: 1_000,
    reminders: 100,
    comments: 200,
  });
});

function counts(conn: Database.Database): Record<string, number> {
  const table = (name: string) =>
    (conn.prepare(`SELECT COUNT(*) AS c FROM ${name}`).get() as { c: number }).c;
  return {
    entities: table("entities"),
    activity: table("activity"),
    reminders: table("reminders"),
    comments: table("comments"),
    places: table("places"),
    attention: table("attention"),
    searchIndex: table("search_index"),
  };
}

describe("restore drill (14.4)", () => {
  let sourceCounts: Record<string, number>;
  let backupPath: string;

  it("seeds reference data and takes a verified backup", async () => {
    sourceCounts = counts(sqlite);
    expect(sourceCounts.entities).toBeGreaterThanOrEqual(200);
    expect(sourceCounts.activity).toBe(1_000);

    backupPath = await backupDatabase(sqlite, new Date("2026-01-15T12:00:00Z"), backupDir);
    expect(backupPath).toContain("2026-01-15");
  });

  it("restores the backup into a fresh directory and the data matches", async () => {
    const destPath = join(restoredDir, "hearth.db");
    await restoreDatabase(backupPath, destPath);

    // Open the restored database and verify integrity + row counts.
    const restored = new Database(destPath, { readonly: true });
    try {
      const integrity = restored.pragma("integrity_check") as Array<{
        integrity_check: string;
      }>;
      expect(integrity[0]?.integrity_check).toBe("ok");

      const restoredCounts = counts(restored);
      expect(restoredCounts).toEqual(sourceCounts);
    } finally {
      restored.close();
    }
  });

  it("the restored database serves the same seeded entities", async () => {
    const destPath = join(restoredDir, "hearth.db");
    const restored = new Database(destPath, { readonly: true });
    try {
      const source = sqlite
        .prepare("SELECT id, title FROM entities WHERE type = 'notes-page' ORDER BY id LIMIT 50")
        .all() as Array<{ id: string; title: string }>;
      const restoredRows = restored
        .prepare("SELECT id, title FROM entities WHERE type = 'notes-page' ORDER BY id LIMIT 50")
        .all() as Array<{ id: string; title: string }>;
      expect(restoredRows).toEqual(source);
    } finally {
      restored.close();
    }
  });
});
