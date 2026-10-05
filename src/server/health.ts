/**
 * Health check logic for GET /api/health (design D20, task 4.3).
 *
 * Checks:
 *  - database: a trivial SELECT 1 to confirm the DB answers.
 *  - scheduler: the most recent `last_started_at` across all job_runs rows must
 *    be within the last 15 minutes (every-tick jobs keep this current).
 *  - jobs: any job_runs row with a non-null `last_error` is reported as failing.
 *
 * Response MUST NOT contain household data (entity titles, user names, etc.).
 */

import type Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DatabaseCheck {
  ok: boolean;
  message?: string;
}

export interface SchedulerCheck {
  ok: boolean;
  message?: string;
}

export interface JobsCheck {
  ok: boolean;
  /** Names of jobs whose last run failed (last_error IS NOT NULL). */
  failing?: string[];
}

export interface HealthChecks {
  database: DatabaseCheck;
  scheduler: SchedulerCheck;
  jobs: JobsCheck;
}

export interface HealthResult {
  ok: boolean;
  checks: HealthChecks;
}

// ---------------------------------------------------------------------------
// Connection management (injectable for tests; wired in instrumentation.ts)
// ---------------------------------------------------------------------------

let _conn: Database.Database | null = null;

/**
 * Override the database connection used by getHealthResult().
 * In production this is called from instrumentation.ts; in tests it is called
 * from beforeEach/afterEach.
 */
export function setHealthConnection(conn: Database.Database | null): void {
  _conn = conn;
}

function getConn(): Database.Database {
  if (!_conn) {
    throw new Error(
      "health: no database connection set. " +
        "Call setHealthConnection() or wire via instrumentation.ts.",
    );
  }
  return _conn;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum age of the last scheduler tick before the check fails. */
const SCHEDULER_STALE_MS = 15 * 60 * 1000; // 15 minutes

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

function checkDatabase(conn: Database.Database): DatabaseCheck {
  try {
    conn.prepare("SELECT 1").get();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "database query failed",
    };
  }
}

function checkScheduler(
  conn: Database.Database,
  now: Date,
): SchedulerCheck {
  try {
    const row = conn
      .prepare("SELECT MAX(last_started_at) AS last_tick FROM job_runs")
      .get() as { last_tick: number | null };

    if (row.last_tick === null) {
      return { ok: false, message: "no tick has run" };
    }

    const ageMs = now.getTime() - row.last_tick;
    if (ageMs > SCHEDULER_STALE_MS) {
      const minutes = Math.round(ageMs / 60_000);
      return { ok: false, message: `no tick in ${minutes} minutes` };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "scheduler check failed",
    };
  }
}

function checkJobs(conn: Database.Database): JobsCheck {
  try {
    const rows = conn
      .prepare(
        "SELECT name FROM job_runs WHERE last_error IS NOT NULL",
      )
      .all() as { name: string }[];

    if (rows.length === 0) {
      return { ok: true };
    }

    return { ok: false, failing: rows.map((r) => r.name) };
  } catch {
    return { ok: false, failing: [] };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the full health result from an explicit DB connection and reference
 * time. Pure function — safe to call in tests with any connection.
 */
export function computeHealth(
  conn: Database.Database,
  now: Date = new Date(),
): HealthResult {
  const database = checkDatabase(conn);
  const scheduler = checkScheduler(conn, now);
  const jobs = checkJobs(conn);

  const ok = database.ok && scheduler.ok && jobs.ok;
  return { ok, checks: { database, scheduler, jobs } };
}

/**
 * Compute health using the injected (or production) connection.
 * Throws if no connection has been set.
 */
export function getHealthResult(now: Date = new Date()): HealthResult {
  return computeHealth(getConn(), now);
}
