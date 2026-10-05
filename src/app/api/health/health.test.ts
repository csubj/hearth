/**
 * Tests for GET /api/health (task 4.3).
 *
 * Uses createTestDatabase() for a fresh in-memory SQLite DB with all migrations
 * applied. Injects the connection via setHealthConnection() and calls the GET
 * handler directly with a Request object.
 *
 * Scenarios:
 *  1. Healthy: DB answers and a recent tick → 200 { ok: true }
 *  2. Stale scheduler: last tick > 15 min ago → 503 naming the scheduler check
 *  3. No tick: job_runs empty → 503 naming the scheduler check
 *  4. Failed job: a job_runs row with last_error → 503 naming the failing job
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../../../db/testing";
import { setHealthConnection } from "../../../server/health";
import { GET } from "./route";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let db: TestDatabase;

beforeEach(() => {
  db = createTestDatabase();
  setHealthConnection(db.connection);
});

afterEach(() => {
  setHealthConnection(null);
  db.connection.close();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedJobRun(
  name: string,
  opts: {
    lastStartedAt?: number;
    lastSucceededAt?: number | null;
    lastError?: string | null;
  } = {},
): void {
  const now = Date.now();
  db.connection
    .prepare(
      `INSERT INTO job_runs (name, last_started_at, last_succeeded_at, last_error)
       VALUES (?, ?, ?, ?)`,
    )
    .run(
      name,
      opts.lastStartedAt ?? now,
      opts.lastSucceededAt ?? null,
      opts.lastError ?? null,
    );
}

async function callHealth(): Promise<{
  status: number;
  body: {
    ok: boolean;
    checks: {
      database: { ok: boolean; message?: string };
      scheduler: { ok: boolean; message?: string };
      jobs: { ok: boolean; failing?: string[] };
    };
  };
}> {
  const res = await GET();
  const body = (await res.json()) as {
    ok: boolean;
    checks: {
      database: { ok: boolean; message?: string };
      scheduler: { ok: boolean; message?: string };
      jobs: { ok: boolean; failing?: string[] };
    };
  };
  return { status: res.status, body };
}

// ---------------------------------------------------------------------------
// Scenario 1: Healthy — DB answers and recent tick
// ---------------------------------------------------------------------------

describe("healthy case", () => {
  it("returns 200 with ok: true when DB answers and tick is recent", async () => {
    const now = Date.now();
    seedJobRun("reminders", {
      lastStartedAt: now,
      lastSucceededAt: now,
    });

    const { status, body } = await callHealth();

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.checks.database.ok).toBe(true);
    expect(body.checks.scheduler.ok).toBe(true);
    expect(body.checks.jobs.ok).toBe(true);
  });

  it("response does not contain household data (no entity titles or user fields)", async () => {
    seedJobRun("reminders", { lastStartedAt: Date.now() });

    const { body } = await callHealth();

    const responseText = JSON.stringify(body);
    // The payload must not contain entity/user data fields
    expect(responseText).not.toMatch(/"title"/);
    expect(responseText).not.toMatch(/"entity_id"/);
    expect(responseText).not.toMatch(/"created_by"/);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Stale scheduler — last tick older than 15 minutes
// ---------------------------------------------------------------------------

describe("stale scheduler", () => {
  it("returns 503 naming the scheduler check when last tick is 20 minutes old", async () => {
    const staleTime = Date.now() - 20 * 60 * 1000; // 20 minutes ago
    seedJobRun("reminders", {
      lastStartedAt: staleTime,
      lastSucceededAt: staleTime,
    });

    const { status, body } = await callHealth();

    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.checks.scheduler.ok).toBe(false);
    expect(body.checks.scheduler.message).toBeDefined();
    expect(body.checks.scheduler.message).toContain("minutes");
    // Database is still ok
    expect(body.checks.database.ok).toBe(true);
  });

  it("returns 503 naming the scheduler check when no tick has ever run", async () => {
    // No job_runs rows — job_runs table is empty

    const { status, body } = await callHealth();

    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.checks.scheduler.ok).toBe(false);
    expect(body.checks.scheduler.message).toBe("no tick has run");
    expect(body.checks.database.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Failed job — a job_runs row has last_error set
// ---------------------------------------------------------------------------

describe("failed job", () => {
  it("returns 503 naming the failing job when last_error is set", async () => {
    const now = Date.now();
    // Scheduler is healthy (recent tick from reminders job)
    seedJobRun("reminders", {
      lastStartedAt: now,
      lastSucceededAt: now,
    });
    // Backup job failed
    seedJobRun("backup", {
      lastStartedAt: now,
      lastSucceededAt: null,
      lastError: "disk full",
    });

    const { status, body } = await callHealth();

    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.checks.jobs.ok).toBe(false);
    expect(body.checks.jobs.failing).toBeDefined();
    expect(body.checks.jobs.failing).toContain("backup");
    // Scheduler and database are still ok
    expect(body.checks.scheduler.ok).toBe(true);
    expect(body.checks.database.ok).toBe(true);
  });

  it("names all failing jobs when multiple jobs have errors", async () => {
    const now = Date.now();
    seedJobRun("reminders", {
      lastStartedAt: now,
      lastSucceededAt: now,
    });
    seedJobRun("backup", {
      lastStartedAt: now,
      lastError: "disk full",
    });
    seedJobRun("trash-purge", {
      lastStartedAt: now,
      lastError: "FK constraint",
    });

    const { status, body } = await callHealth();

    expect(status).toBe(503);
    expect(body.checks.jobs.ok).toBe(false);
    expect(body.checks.jobs.failing).toContain("backup");
    expect(body.checks.jobs.failing).toContain("trash-purge");
  });

  it("does not flag a job that recovered (last_error cleared)", async () => {
    const now = Date.now();
    seedJobRun("reminders", {
      lastStartedAt: now,
      lastSucceededAt: now,
    });
    // backup previously failed but now has last_error = NULL (recovered)
    seedJobRun("backup", {
      lastStartedAt: now,
      lastSucceededAt: now,
      lastError: null,
    });

    const { status, body } = await callHealth();

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.checks.jobs.ok).toBe(true);
  });
});
