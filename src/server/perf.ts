/**
 * Performance measurement (design D19, task 14.3).
 *
 * `runPerf()` times the server-side work for the procedures that make up the
 * reference dataset's key queries — module list, entity detail, global
 * search, the Today page (inbox count + due feed + activity + pinned), and
 * one scheduler tick (the every-tick reminder job) — and reports the p95
 * against the D19 budgets:
 *
 *   list / detail / search ≤ 100 ms, Today ≤ 200 ms, one tick ≤ 200 ms
 *
 * `pnpm perf` (perf-cli) seeds the reference dataset and prints the report,
 * exiting non-zero when any measured p95 exceeds its budget.
 *
 * The procedures run through the server-side router client against the single
 * household connection (`src/db`), so the measurement reflects what a web
 * request would pay in server time.
 */

import { createRouterClient } from "@orpc/server";
import { randomUUID } from "node:crypto";

import { db, sqlite } from "../db";
import { router } from "./router";
import { validationInterceptor } from "./orpc";
import type { AppContext } from "./context";
import { processDueReminders } from "./reminders";

// ---------------------------------------------------------------------------
// Budgets (design D19)
// ---------------------------------------------------------------------------

export const BUDGETS = {
  list: 100,
  detail: 100,
  search: 100,
  today: 200,
  tick: 200,
} as const;

export type BudgetKey = keyof typeof BUDGETS;

export interface PerfReport {
  samples: Record<BudgetKey, number[]>;
  p95: Record<BudgetKey, number>;
  budgets: Record<BudgetKey, number>;
  overBudget: BudgetKey[];
}

// ---------------------------------------------------------------------------
// p95 helper
// ---------------------------------------------------------------------------

/** Compute the 95th percentile of a set of sample times (ms). */
export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx]!;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

function makeContext(userId: string): AppContext {
  return {
    user: {
      id: userId,
      name: "Perf User",
      email: `${userId}@users.hearth.invalid`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      role: "admin",
    } as AppContext["user"],
    via: "web",
    now: Date.now(),
    requestId: randomUUID(),
  };
}

// ---------------------------------------------------------------------------
// Timed runner
// ---------------------------------------------------------------------------

async function timed<T>(fn: () => Promise<T> | T): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

// ---------------------------------------------------------------------------
// runPerf
// ---------------------------------------------------------------------------

export interface PerfOptions {
  /** The user id to measure as. Defaults to the seeded admin. */
  userId?: string;
  /** How many times to time each query before taking p95. */
  iterations?: number;
  /** The id of an entity to read in the detail measurement. */
  entityId?: string;
}

/**
 * Run the performance measurements against the current household DB and
 * report p95 per procedure group versus the D19 budgets.
 *
 * @throws if the database has no notes-page entities to measure against.
 */
export async function runPerf(opts: PerfOptions = {}): Promise<PerfReport> {
  const userId = opts.userId ?? "seed-admin-user";
  const iterations = opts.iterations ?? 15;

  const client = createRouterClient(router, {
    context: makeContext(userId),
    interceptors: [validationInterceptor],
  });
  const c = client as unknown as Record<string, CallableFunction>;

  // Pick an entity id to use for the detail measurement.
  const row = sqlite
    .prepare("SELECT id FROM entities WHERE type = 'notes-page' ORDER BY id LIMIT 1")
    .get() as { id: string } | undefined;
  if (!row) {
    throw new Error("perf: no notes-page entities in the database — run the seed first.");
  }
  const entityId = opts.entityId ?? row.id;

  const samples: PerfReport["samples"] = {
    list: [],
    detail: [],
    search: [],
    today: [],
    tick: [],
  };

  for (let i = 0; i < iterations; i++) {
    samples.list.push(
      await timed(() => c.notesPageList({ limit: 50 }) as Promise<unknown>),
    );
    samples.detail.push(
      await timed(() => c.notesPageGet({ id: entityId }) as Promise<unknown>),
    );
    samples.search.push(
      await timed(() => c.search({ q: "note", limit: 20 }) as Promise<unknown>),
    );
    samples.today.push(
      await timed(() => {
        const p = c.inboxCount({}) as Promise<unknown>;
        const d = c.remindersDueFeed({}) as Promise<unknown>;
        const a = c.listActivity({ limit: 20 }) as Promise<unknown>;
        const pi = c.listPinned({}) as Promise<unknown>;
        return Promise.all([p, d, a, pi]);
      }),
    );
    // One scheduler tick: the every-tick reminder job.
    samples.tick.push(
      await timed(() => processDueReminders(sqlite, new Date())),
    );
  }

  const p95 = {
    list: percentile(samples.list, 95),
    detail: percentile(samples.detail, 95),
    search: percentile(samples.search, 95),
    today: percentile(samples.today, 95),
    tick: percentile(samples.tick, 95),
  };

  const overBudget = (Object.keys(BUDGETS) as BudgetKey[]).filter(
    (k) => p95[k] > BUDGETS[k],
  );

  return { samples, p95, budgets: { ...BUDGETS }, overBudget };
}
