/**
 * Perf smoke test (design D19, task 14.3).
 *
 * Seeds a reduced dataset and runs `runPerf()`, asserting each procedure
 * group's measured p95 is within its D19 budget. This runs headless in Vitest
 * on the in-memory household DB and confirms the measurement wiring works and
 * the indexed queries are fast. The full reference dataset (--large) is what
 * `pnpm perf` times on a laptop — this test verifies the budget check at a
 * smaller size.
 */

import { vi, describe, it, expect, beforeAll } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "file::memory:?cache=shared";
});

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, sqlite } from "../db";
import { MIGRATIONS_FOLDER } from "../db/testing";
import { seedDatabase } from "./seed";
import { runPerf, BUDGETS, type BudgetKey } from "./perf";

beforeAll(() => {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  seedDatabase(sqlite, {
    entities: 1_000,
    places: 100,
    activity: 5_000,
    reminders: 300,
    comments: 500,
  });
});

describe("perf smoke (14.3)", () => {
  it("reports a p95 per procedure group within the D19 budgets", async () => {
    const report = await runPerf({ iterations: 10 });

    for (const key of Object.keys(BUDGETS) as BudgetKey[]) {
      expect(report.p95[key]).toBeLessThanOrEqual(report.budgets[key]);
      expect(report.p95[key]).toBeGreaterThanOrEqual(0);
    }
    expect(report.overBudget).toEqual([]);
  });
});
