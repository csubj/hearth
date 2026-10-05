/**
 * Tests for the job scheduler (task 3.5).
 *
 * Uses `createTestDatabase()` for an in-memory SQLite with all migrations
 * applied, and injects the connection via `setConnection()`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, type TestDatabase } from "../db/testing";
import {
  tick,
  registerJob,
  _clearJobs,
  setConnection,
  isRunning,
  waitForTick,
  stopScheduler,
} from "./jobs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getJobRun(db: TestDatabase, name: string) {
  return db.connection
    .prepare("SELECT * FROM job_runs WHERE name = ?")
    .get(name) as {
      name: string;
      last_started_at: number | null;
      last_succeeded_at: number | null;
      last_error: string | null;
    } | undefined;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let db: TestDatabase;

beforeEach(() => {
  db = createTestDatabase();
  setConnection(db.connection);
  _clearJobs();
});

afterEach(() => {
  setConnection(null);
  db.connection.close();
  // Reset the globalThis scheduler flag
  const g = globalThis as Record<string, unknown>;
  g.__hearthSchedulerStarted = false;
  g.__hearthSchedulerInterval = undefined;
});

// ---------------------------------------------------------------------------
// Daily job runs once per day
// ---------------------------------------------------------------------------

describe("daily-once tracking", () => {
  it("runs a daily job on the first tick of the day, skips the second, runs again next day", async () => {
    const calls: string[] = [];

    registerJob({
      name: "test-daily",
      frequency: "daily",
      run: () => {
        calls.push("ran");
      },
    });

    const day1 = new Date("2025-03-15T10:00:00Z");
    const day1Later = new Date("2025-03-15T18:00:00Z");
    const day2 = new Date("2025-03-16T08:00:00Z");

    // First tick on day 1 — should run
    await tick(day1);
    expect(calls).toEqual(["ran"]);

    // Second tick on same day — should skip
    await tick(day1Later);
    expect(calls).toEqual(["ran"]);

    // First tick on day 2 — should run again
    await tick(day2);
    expect(calls).toEqual(["ran", "ran"]);

    // Verify job_runs records
    const run = getJobRun(db, "test-daily");
    expect(run).toBeDefined();
    expect(run!.last_succeeded_at).toBe(day2.getTime());
    expect(run!.last_error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Per-tick job runs every tick
// ---------------------------------------------------------------------------

describe("per-tick jobs", () => {
  it("runs on every tick while daily jobs run once per day", async () => {
    const tickCalls: string[] = [];
    const dailyCalls: string[] = [];

    registerJob({
      name: "test-every-tick",
      frequency: "every-tick",
      run: () => {
        tickCalls.push("tick");
      },
    });

    registerJob({
      name: "test-daily-2",
      frequency: "daily",
      run: () => {
        dailyCalls.push("daily");
      },
    });

    const t1 = new Date("2025-03-15T10:00:00Z");
    const t2 = new Date("2025-03-15T10:05:00Z");
    const t3 = new Date("2025-03-15T10:10:00Z");

    await tick(t1);
    await tick(t2);
    await tick(t3);

    // Per-tick job ran 3 times
    expect(tickCalls).toEqual(["tick", "tick", "tick"]);
    // Daily job ran only once
    expect(dailyCalls).toEqual(["daily"]);
  });
});

// ---------------------------------------------------------------------------
// Failure isolation
// ---------------------------------------------------------------------------

describe("failure isolation", () => {
  it("a failing job does not stop subsequent jobs", async () => {
    const calls: string[] = [];

    registerJob({
      name: "job-a-fails",
      frequency: "every-tick",
      run: () => {
        calls.push("a-start");
        throw new Error("Job A exploded");
      },
    });

    registerJob({
      name: "job-b-succeeds",
      frequency: "every-tick",
      run: () => {
        calls.push("b-ran");
      },
    });

    // Suppress the console.error from the isolation handler
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await tick(new Date("2025-03-15T10:00:00Z"));

    errorSpy.mockRestore();

    // B still ran despite A's failure
    expect(calls).toContain("a-start");
    expect(calls).toContain("b-ran");

    // job_runs records A's error
    const runA = getJobRun(db, "job-a-fails");
    expect(runA).toBeDefined();
    expect(runA!.last_error).toBe("Job A exploded");
    expect(runA!.last_succeeded_at).toBeNull();

    // job_runs records B's success
    const runB = getJobRun(db, "job-b-succeeds");
    expect(runB).toBeDefined();
    expect(runB!.last_error).toBeNull();
    expect(runB!.last_succeeded_at).not.toBeNull();
  });

  it("a failing daily job records the error and retries next tick", async () => {
    let shouldFail = true;
    const calls: string[] = [];

    registerJob({
      name: "flaky-daily",
      frequency: "daily",
      run: () => {
        if (shouldFail) {
          throw new Error("disk full");
        }
        calls.push("success");
      },
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const t1 = new Date("2025-03-15T10:00:00Z");
    await tick(t1);

    // Failed — should have recorded error, no last_succeeded_at
    const run1 = getJobRun(db, "flaky-daily");
    expect(run1!.last_error).toBe("disk full");
    expect(run1!.last_succeeded_at).toBeNull();

    // Next tick same day: since it never succeeded, it should retry
    shouldFail = false;
    const t2 = new Date("2025-03-15T10:05:00Z");
    await tick(t2);

    errorSpy.mockRestore();

    expect(calls).toEqual(["success"]);
    const run2 = getJobRun(db, "flaky-daily");
    expect(run2!.last_error).toBeNull();
    expect(run2!.last_succeeded_at).toBe(t2.getTime());
  });
});

// ---------------------------------------------------------------------------
// Overlap guard
// ---------------------------------------------------------------------------

describe("overlap guard", () => {
  it("a second tick returns immediately while the first is running", async () => {
    let jobRunCount = 0;
    let resolveJob: (() => void) | null = null;

    registerJob({
      name: "slow-job",
      frequency: "every-tick",
      run: async () => {
        jobRunCount++;
        await new Promise<void>((r) => {
          resolveJob = r;
        });
      },
    });

    const now = new Date("2025-03-15T10:00:00Z");

    // Start the first tick — it will block on the slow job
    const tick1 = tick(now);

    // Wait a microtask so tick1 enters the running state
    await new Promise((r) => setTimeout(r, 0));

    expect(isRunning()).toBe(true);

    // Second tick should return immediately (overlap guard)
    const tick2 = tick(now);
    await tick2;

    // The slow job should have only started once
    expect(jobRunCount).toBe(1);

    // Let the first tick complete
    resolveJob!();
    await tick1;

    expect(isRunning()).toBe(false);
    expect(jobRunCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Scheduler start guard (instrumentation.ts register)
// ---------------------------------------------------------------------------

describe("register() guard", () => {
  it("a second register() call does not start a second timer", async () => {
    // Import register dynamically to test it
    const { register } = await import("../instrumentation");

    // Simulate the Node.js runtime environment
    const origRuntime = process.env.NEXT_RUNTIME;
    const origPhase = process.env.NEXT_PHASE;
    process.env.NEXT_RUNTIME = "nodejs";
    delete process.env.NEXT_PHASE;

    const g = globalThis as Record<string, unknown>;
    g.__hearthSchedulerStarted = false;
    g.__hearthSchedulerInterval = undefined;

    // Register jobs so tick() has something to run
    registerJob({
      name: "guard-test",
      frequency: "every-tick",
      run: () => {},
    });

    // Suppress noisy errors from the startup tick (the test DB
    // is already wired via setConnection in beforeEach)
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // First call — should start the scheduler
    await register();

    expect(g.__hearthSchedulerStarted).toBe(true);
    const firstInterval = g.__hearthSchedulerInterval;
    expect(firstInterval).toBeDefined();

    // Second call — should NOT start another timer
    await register();

    // The interval should be the same object (no second timer)
    expect(g.__hearthSchedulerInterval).toBe(firstInterval);

    // Cleanup
    await stopScheduler();
    // Wait a moment for any pending tick to complete
    await waitForTick();

    errorSpy.mockRestore();

    process.env.NEXT_RUNTIME = origRuntime;
    if (origPhase !== undefined) {
      process.env.NEXT_PHASE = origPhase;
    }
  });

  it("does not start when NEXT_RUNTIME is not nodejs", async () => {
    const { register } = await import("../instrumentation");

    const origRuntime = process.env.NEXT_RUNTIME;
    process.env.NEXT_RUNTIME = "edge";

    const g = globalThis as Record<string, unknown>;
    g.__hearthSchedulerStarted = false;

    await register();

    expect(g.__hearthSchedulerStarted).toBeFalsy();

    process.env.NEXT_RUNTIME = origRuntime;
  });

  it("does not start during production build", async () => {
    const { register } = await import("../instrumentation");

    const origRuntime = process.env.NEXT_RUNTIME;
    const origPhase = process.env.NEXT_PHASE;
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.NEXT_PHASE = "phase-production-build";

    const g = globalThis as Record<string, unknown>;
    g.__hearthSchedulerStarted = false;

    await register();

    expect(g.__hearthSchedulerStarted).toBeFalsy();

    process.env.NEXT_RUNTIME = origRuntime;
    if (origPhase !== undefined) {
      process.env.NEXT_PHASE = origPhase;
    } else {
      delete process.env.NEXT_PHASE;
    }
  });
});

// ---------------------------------------------------------------------------
// stopScheduler
// ---------------------------------------------------------------------------

describe("stopScheduler", () => {
  it("clears the interval and waits for a running tick", async () => {
    let resolveJob: (() => void) | null = null;

    registerJob({
      name: "stop-test",
      frequency: "every-tick",
      run: async () => {
        await new Promise<void>((r) => {
          resolveJob = r;
        });
      },
    });

    const now = new Date("2025-03-15T10:00:00Z");

    // Start a tick that will block
    const tickPromise = tick(now);
    await new Promise((r) => setTimeout(r, 0));
    expect(isRunning()).toBe(true);

    // Start stop — it should wait for the running tick
    const stopPromise = stopScheduler();

    // Tick is still running
    expect(isRunning()).toBe(true);

    // Let the job complete
    resolveJob!();

    await tickPromise;
    await stopPromise;

    expect(isRunning()).toBe(false);
  });
});
