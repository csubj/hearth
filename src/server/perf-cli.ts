/**
 * CLI entry point for `pnpm perf` (design D19, task 14.3).
 *
 * Measures the server-time p95 of the reference dataset's key procedure
 * groups and reports them against the D19 budgets. Exits non-zero when any
 * measured p95 exceeds its budget.
 *
 * Usage:
 *   pnpm perf              → time against the current database
 *   pnpm perf --large      → seed the reference dataset first, then time it
 */

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, sqlite } from "../db";
import { MIGRATIONS_FOLDER } from "../db/testing";
import { runPerf, BUDGETS, type BudgetKey } from "./perf";
import { seedDatabase } from "./seed";

async function main(): Promise<void> {
  if (process.argv.includes("--large")) {
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    const stats = seedDatabase(sqlite, {});
    console.log(
      `✓ seeded reference dataset: ${stats.entities} entities, ${stats.reminders} reminders`,
    );
  }

  const report = await runPerf();

  let ok = true;
  for (const key of Object.keys(BUDGETS) as BudgetKey[]) {
    const measured = report.p95[key];
    const budget = report.budgets[key];
    const pass = measured <= budget;
    if (!pass) ok = false;
    console.log(
      `${key.padEnd(8)} p95=${measured.toFixed(1)}ms  budget=${budget}ms  ${pass ? "OK" : "OVER"}`,
    );
  }

  if (!ok) {
    console.error("perf: budget(s) exceeded on the reference dataset.");
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error("✗ perf failed:", err);
  process.exit(1);
});
