/**
 * Job scheduler (design D11, task 3.5).
 *
 * `tick(now)` runs all registered jobs sequentially with per-job error
 * isolation: a failure is logged and recorded in `job_runs` but does not
 * stop the others. An overlap guard prevents re-entry.
 *
 * Daily jobs run once per calendar day (UTC of `now`), tracked via the
 * `job_runs` table's `last_succeeded_at` column.
 */

import type Database from "better-sqlite3";
import { dirname } from "node:path";
import { prune as pruneRateLimitMap } from "./auth/rate-limit";
import { logJob } from "../lib/logger";
import { backupDatabase, applyRetention } from "./backup";
import { purgeTrash } from "./trash";
import { sweepAttachments } from "./attachments";
import { processDueReminders } from "./reminders";
import { checkSearchConsistency } from "../db/search";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobFrequency = "every-tick" | "daily";

export interface JobDefinition {
  name: string;
  frequency: JobFrequency;
  run: (now: Date, conn: Database.Database) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Job registry
// ---------------------------------------------------------------------------

const jobs: JobDefinition[] = [];

export function registerJob(job: JobDefinition): void {
  jobs.push(job);
}

/** Read-only access to the registered jobs (useful for tests). */
export function getJobs(): readonly JobDefinition[] {
  return jobs;
}

/** Clear all registered jobs. Test-only. */
export function _clearJobs(): void {
  jobs.length = 0;
}

// ---------------------------------------------------------------------------
// Overlap guard
// ---------------------------------------------------------------------------

let running = false;
/** Promise that resolves when the current tick finishes (if running). */
let runningPromise: Promise<void> | null = null;

/** Whether a tick is currently in progress. */
export function isRunning(): boolean {
  return running;
}

/**
 * Wait for the current tick to finish, if one is in progress.
 * Returns immediately if no tick is running.
 */
export function waitForTick(): Promise<void> {
  return runningPromise ?? Promise.resolve();
}

// ---------------------------------------------------------------------------
// DB connection override (for tests / CLI)
// ---------------------------------------------------------------------------

let _connOverride: Database.Database | null = null;

/**
 * Override the database connection used by `tick()`. When set, `tick()` uses
 * this connection instead of importing the production singleton.
 */
export function setConnection(conn: Database.Database | null): void {
  _connOverride = conn;
}

function getConnection(): Database.Database {
  if (!_connOverride) {
    throw new Error(
      "jobs: no database connection set. " +
        "Call setConnection() before tick().",
    );
  }
  return _connOverride;
}

// ---------------------------------------------------------------------------
// Daily-once tracking helpers
// ---------------------------------------------------------------------------

/** Return the `YYYY-MM-DD` calendar date string for `d`. */
function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Check whether a daily job already succeeded today (by comparing the
 * calendar day of `now` with `last_succeeded_at` in `job_runs`).
 */
function alreadyRanToday(
  conn: Database.Database,
  name: string,
  now: Date,
): boolean {
  const row = conn
    .prepare("SELECT last_succeeded_at FROM job_runs WHERE name = ?")
    .get(name) as { last_succeeded_at: number | null } | undefined;

  if (!row?.last_succeeded_at) return false;

  const lastDate = new Date(row.last_succeeded_at);
  return dateKey(lastDate) === dateKey(now);
}

/** Record that a job started. */
function recordStart(
  conn: Database.Database,
  name: string,
  now: Date,
): void {
  conn
    .prepare(
      `INSERT INTO job_runs (name, last_started_at)
       VALUES (?, ?)
       ON CONFLICT (name) DO UPDATE SET last_started_at = excluded.last_started_at`,
    )
    .run(name, now.getTime());
}

/** Record that a job succeeded. */
function recordSuccess(
  conn: Database.Database,
  name: string,
  now: Date,
): void {
  conn
    .prepare(
      `UPDATE job_runs SET last_succeeded_at = ?, last_error = NULL
       WHERE name = ?`,
    )
    .run(now.getTime(), name);
}

/** Record that a job failed. */
function recordError(
  conn: Database.Database,
  name: string,
  error: unknown,
): void {
  const message =
    error instanceof Error ? error.message : String(error);
  conn
    .prepare("UPDATE job_runs SET last_error = ? WHERE name = ?")
    .run(message, name);
}

// ---------------------------------------------------------------------------
// tick()
// ---------------------------------------------------------------------------

/**
 * Run all registered jobs sequentially. Per-job error isolation: a failure
 * is logged and recorded in `job_runs` but does not prevent other jobs from
 * running. Daily jobs only run once per calendar day.
 *
 * @param now - The current time (injectable for testing with a fake clock).
 */
export async function tick(now: Date): Promise<void> {
  if (running) return;
  running = true;

  let resolve: () => void;
  runningPromise = new Promise<void>((r) => {
    resolve = r;
  });

  try {
    const conn = getConnection();

    // Per-tick tasks that don't use job_runs
    pruneRateLimitMap(now.getTime());

    for (const job of jobs) {
      // Daily jobs: skip if already succeeded today
      if (job.frequency === "daily" && alreadyRanToday(conn, job.name, now)) {
        continue;
      }

      const jobStartMs = Date.now();
      try {
        recordStart(conn, job.name, now);
        await job.run(now, conn);
        recordSuccess(conn, job.name, now);
        logJob({
          name: job.name,
          startedAt: new Date(jobStartMs).toISOString(),
          durationMs: Date.now() - jobStartMs,
          ok: true,
        });
      } catch (err) {
        console.error(`[jobs] ${job.name} failed:`, err);
        recordError(conn, job.name, err);
        logJob({
          name: job.name,
          startedAt: new Date(jobStartMs).toISOString(),
          durationMs: Date.now() - jobStartMs,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } finally {
    running = false;
    resolve!();
    runningPromise = null;
  }
}

// ---------------------------------------------------------------------------
// Built-in jobs (stubs for mechanisms built in later tasks)
// ---------------------------------------------------------------------------

/** Per-tick: reminder processing (design D11/D14, task 11.3). */
registerJob({
  name: "reminders",
  frequency: "every-tick",
  run: (now, conn) => {
    processDueReminders(conn, now);
  },
});

/** Daily: trash purge in batches of 200 (task 6.7). */
registerJob({
  name: "trash-purge",
  frequency: "daily",
  run: async (now, conn) => {
    await purgeTrash(conn, now);
  },
});

/** Daily: attachment orphan sweep (task 8.4, design D15). */
registerJob({
  name: "attachment-orphan-sweep",
  frequency: "daily",
  run: (now, conn) => {
    sweepAttachments(conn, now.getTime());
  },
});

/** Daily: search consistency check with automatic repair (task 12.2, design D10). */
registerJob({
  name: "search-consistency",
  frequency: "daily",
  run: (_now, conn) => {
    const repaired = checkSearchConsistency(conn);
    if (repaired > 0) {
      console.log(`[search-consistency] repaired ${repaired} index row(s)`);
    }
  },
});

/** Daily: online backup with integrity verification and retention (task 4.2). */
registerJob({
  name: "backup",
  frequency: "daily",
  run: async (now, conn) => {
    const backupPath = await backupDatabase(conn, now);
    await applyRetention(dirname(backupPath));
  },
});

/** Daily: expired session cleanup. */
registerJob({
  name: "expired-session-cleanup",
  frequency: "daily",
  run: (now, conn) => {
    conn
      .prepare("DELETE FROM session WHERE expires_at < ?")
      .run(now.getTime());
  },
});

/** Daily: expired idempotency key cleanup (24 h). */
registerJob({
  name: "idempotency-key-cleanup",
  frequency: "daily",
  run: (now, conn) => {
    const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
    conn.prepare("DELETE FROM idempotency_keys WHERE created_at < ?").run(cutoff);
  },
});

/** Daily: PRAGMA optimize (D19). */
registerJob({
  name: "pragma-optimize",
  frequency: "daily",
  run: (_now, conn) => {
    conn.pragma("optimize");
  },
});

// ---------------------------------------------------------------------------
// Scheduler lifecycle (used by instrumentation.ts and shutdown)
// ---------------------------------------------------------------------------

/** Stop the scheduler interval and wait for any running tick. */
export async function stopScheduler(): Promise<void> {
  const g = globalThis as Record<string, unknown>;
  const intervalId = g.__hearthSchedulerInterval as ReturnType<
    typeof setInterval
  > | undefined;
  if (intervalId) {
    clearInterval(intervalId);
    g.__hearthSchedulerInterval = undefined;
  }
  g.__hearthSchedulerStarted = false;
  await waitForTick();
}
