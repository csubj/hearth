/**
 * EXPLAIN QUERY PLAN perf test (design D19, task 14.3).
 *
 * Runs `EXPLAIN QUERY PLAN` on the query shapes behind the module list,
 * global search, the Today page (activity feed + inbox count + due feed),
 * and one scheduler tick, over a seeded database, and FAILS if any of them
 * performs a full scan of the `entities`, `activity`, or `attention` tables.
 *
 * These are the query shapes that must stay indexed at household scale
 * (10k entities, 50k activity, 2k reminders). The plan is chosen by the
 * indexes in the schema and is independent of row count, so a modest seed is
 * sufficient to assert the b-tree index is used.
 *
 * Runs headless in Vitest.
 */

import { vi, describe, it, expect, beforeAll } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "file::memory:?cache=shared";
});

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, sqlite } from "../db";
import { MIGRATIONS_FOLDER } from "../db/testing";
import { seedDatabase } from "./seed";

beforeAll(() => {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  seedDatabase(sqlite, {
    entities: 500,
    places: 100,
    activity: 2_000,
    reminders: 300,
    comments: 500,
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PlanLine {
  detail: string;
}

function explain(sql: string, params: unknown[] = []): PlanLine[] {
  return sqlite
    .prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .all(...params) as PlanLine[];
}

/**
 * A plan line is a full table scan when it is a bare `SCAN <table>` with no
 * `USING INDEX` and not an FTS virtual-table index scan.
 */
function isFullScan(line: string): boolean {
  if (!line.startsWith("SCAN ")) return false;
  if (line.includes("USING INDEX")) return false;
  if (line.includes("VIRTUAL TABLE INDEX")) return false;
  return true;
}

/** The tables a full scan must never target (target tables by alias). */
const GUARDED_TABLES = new Set([
  "entities",
  "activity",
  "attention",
  "e",
  "a",
  "at",
]);

function assertNoFullScan(label: string, plan: PlanLine[]): void {
  const offenders = plan
    .map((p) => p.detail)
    .filter((detail) => {
      if (!isFullScan(detail)) return false;
      const m = /^SCAN (\w+)/.exec(detail);
      return m ? GUARDED_TABLES.has(m[1]) : true;
    });
  expect(offenders, `${label} full-scans a guarded table`).toEqual([]);
}

// ---------------------------------------------------------------------------
// The query shapes (transcribed from the procedures)
// ---------------------------------------------------------------------------
// NOTES: aliases mirror the procedures exactly (e / a / at / r / si).

const LIST_SQL = `
  SELECT e.*, d.* FROM entities e
  LEFT JOIN notes_page_details d ON d.entity_id = e.id
  WHERE e.type = 'notes-page' AND e.deleted_at IS NULL AND e.archived_at IS NULL
  ORDER BY e.updated_at IS NULL ASC, e.updated_at DESC, e.id DESC LIMIT 51
`;

const SEARCH_SQL = `
  SELECT e.id, e.type, e.title, e.place_id FROM search_index si
  JOIN entities e ON e.id = si.entity_id
  WHERE e.deleted_at IS NULL AND e.archived_at IS NULL
    AND search_index MATCH ?
  ORDER BY bm25(search_index, 0.0, 0.0, 10.0, 1.0) LIMIT 20
`;

const ACTIVITY_FEED_SQL = `
  SELECT a.id FROM activity a
  JOIN entities e ON e.id = a.entity_id
  JOIN user u ON u.id = a.actor_id
  ORDER BY a.created_at DESC, a.id DESC LIMIT 51
`;

const INBOX_COUNT_SQL = `
  SELECT COUNT(*) AS c FROM attention at
  JOIN entities e ON e.id = at.entity_id
  WHERE at.user_id = ? AND at.resolved_at IS NULL AND at.dismissed_at IS NULL
    AND at.read_at IS NULL AND e.deleted_at IS NULL
`;

const DUE_FEED_SQL = `
  SELECT r.*, e.title AS entity_title FROM reminders r
  JOIN entities e ON e.id = r.entity_id
  WHERE r.closed_at IS NULL AND r.due_on <= ? AND e.deleted_at IS NULL AND e.archived_at IS NULL
    AND (
      EXISTS (SELECT 1 FROM reminder_recipients rr JOIN user ru ON ru.id = rr.user_id
              WHERE rr.reminder_id = r.id AND ru.banned = 0 AND rr.user_id = ?)
      OR (NOT EXISTS (SELECT 1 FROM reminder_recipients rr WHERE rr.reminder_id = r.id)
          AND EXISTS (SELECT 1 FROM entity_assignees ea JOIN user au ON au.id = ea.user_id
              WHERE ea.entity_id = e.id AND au.banned = 0 AND ea.user_id = ?))
      OR (NOT EXISTS (SELECT 1 FROM reminder_recipients rr WHERE rr.reminder_id = r.id)
          AND NOT EXISTS (SELECT 1 FROM entity_assignees ea WHERE ea.entity_id = e.id))
    )
  ORDER BY CASE WHEN r.due_on < ? THEN 0 ELSE 1 END, r.due_on ASC, r.id ASC
`;

const TICK_SQL = `
  SELECT r.id, r.entity_id, r.due_on FROM reminders r
  JOIN entities e ON e.id = r.entity_id
  WHERE r.closed_at IS NULL AND r.due_on <= ? AND e.deleted_at IS NULL AND e.archived_at IS NULL
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EXPLAIN QUERY PLAN (14.3)", () => {
  it("module list uses an index (no entities full scan)", () => {
    assertNoFullScan("list", explain(LIST_SQL));
  });

  it("search uses the FTS index (no entities full scan)", () => {
    assertNoFullScan("search", explain(SEARCH_SQL, ["note*"]));
  });

  it("Today activity feed uses an index (no activity full scan)", () => {
    assertNoFullScan("activity", explain(ACTIVITY_FEED_SQL));
  });

  it("inbox count uses an index (no attention full scan)", () => {
    assertNoFullScan("inbox count", explain(INBOX_COUNT_SQL, ["u1"]));
  });

  it("due feed uses an index (no entities/attention full scan)", () => {
    assertNoFullScan(
      "due feed",
      explain(DUE_FEED_SQL, ["2026-01-01", "u1", "u1", "2026-01-01"]),
    );
  });

  it("reminder tick uses an index (no entities full scan)", () => {
    assertNoFullScan("tick", explain(TICK_SQL, ["2026-01-01"]));
  });
});
