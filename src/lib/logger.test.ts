/**
 * Tests for the structured JSON logger (task 4.4, design D20).
 *
 * Covers:
 *  1. logRequest emits one JSON line with the expected fields
 *  2. logJob emits one JSON line (success and failure)
 *  3. A request through the /api/v1 handler emits a log line with
 *     method, route, status, requestId, and via
 *  4. The requestId in the log matches the requestId in the error response
 *     body for an internal error (spec: "MUST match the server log entry")
 *  5. A tick() call emits one job log line per job run
 */

import {
  vi,
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";

// ---------------------------------------------------------------------------
// Point module-level DB singletons at an in-memory DB before any module loads
// ---------------------------------------------------------------------------

vi.hoisted(() => {
  process.env.DATABASE_URL = "file::memory:?cache=shared";
});

// Mock Next.js server-only APIs so the route handler can be imported in tests
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  })),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// Imports (after hoisting and mocks are established)
// ---------------------------------------------------------------------------

import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { db, sqlite } from "../db";
import { MIGRATIONS_FOLDER, createTestDatabase, type TestDatabase } from "../db/testing";
import { auth } from "../server/auth";
import {
  tick,
  registerJob,
  _clearJobs,
  setConnection,
} from "../server/jobs";
import { logRequest, logJob } from "./logger";

// REST handler under test
import { GET, POST } from "../app/api/v1/[[...rest]]/route";

// ---------------------------------------------------------------------------
// stdout capture helper
// ---------------------------------------------------------------------------

/**
 * Start capturing every byte written to process.stdout.
 * Returns `{ lines(), restore() }`.
 *
 * `lines()` parses each captured chunk as newline-separated JSON objects and
 * returns the ones that parse cleanly.
 */
function captureStdout(): {
  lines: () => Array<Record<string, unknown>>;
  restore: () => void;
} {
  const chunks: string[] = [];

  const spy = vi
    .spyOn(process.stdout, "write")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .mockImplementation((chunk: any) => {
      const str =
        typeof chunk === "string"
          ? chunk
          : Buffer.isBuffer(chunk)
            ? chunk.toString("utf8")
            : String(chunk);
      chunks.push(str);
      return true;
    });

  return {
    lines: () =>
      chunks
        .join("")
        .split("\n")
        .map((l) => {
          try {
            return JSON.parse(l.trim()) as Record<string, unknown>;
          } catch {
            return null;
          }
        })
        .filter((l): l is Record<string, unknown> => l !== null),
    restore: () => {
      spy.mockRestore();
    },
  };
}

// ---------------------------------------------------------------------------
// Shared DB setup for /api/v1 handler tests
// ---------------------------------------------------------------------------

beforeAll(() => {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

// Create a real user + API key in the shared in-memory DB.
async function createUserWithApiKey(
  id: string,
  username: string,
): Promise<string> {
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO user
       (id, name, email, email_verified, created_at, updated_at, username, role)
       VALUES (?, ?, ?, 0, unixepoch()*1000, unixepoch()*1000, ?, 'user')`,
    )
    .run(id, username, `${username}@users.hearth.invalid`, username);

  const keyResult = await auth.api.createApiKey({
    body: { userId: id, name: `${username}-key` },
  });
  return (keyResult as Record<string, unknown>).key as string;
}

/** Build a Request to /api/v1/<path> with optional bearer and body. */
function apiRequest(
  path: string,
  options: {
    method?: string;
    bearer?: string;
    body?: unknown;
  } = {},
): Request {
  const method = options.method ?? "GET";
  const url = `http://localhost/api/v1${path}`;
  const hdrs: Record<string, string> = {};
  if (options.bearer) hdrs["Authorization"] = `Bearer ${options.bearer}`;
  let body: string | undefined;
  if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    hdrs["Content-Type"] = "application/json";
  }
  return new Request(url, { method, headers: hdrs, body });
}

// ---------------------------------------------------------------------------
// 1. logRequest unit tests
// ---------------------------------------------------------------------------

describe("logRequest", () => {
  it("emits exactly one JSON line with all required fields", () => {
    const cap = captureStdout();
    logRequest({
      method: "GET",
      route: "/api/v1/ping",
      status: 200,
      durationMs: 42,
      requestId: "req-abc-123",
      via: "web",
    });
    cap.restore();

    const lines = cap.lines();
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line.event).toBe("request");
    expect(line.method).toBe("GET");
    expect(line.route).toBe("/api/v1/ping");
    expect(line.status).toBe(200);
    expect(line.durationMs).toBe(42);
    expect(line.requestId).toBe("req-abc-123");
    expect(line.via).toBe("web");
    expect(typeof line.timestamp).toBe("string");
    expect(line.level).toBe("info");
  });

  it("uses level 'error' for status >= 500", () => {
    const cap = captureStdout();
    logRequest({
      method: "POST",
      route: "/api/v1/echo",
      status: 500,
      durationMs: 10,
      requestId: "req-500",
      via: "my-key",
    });
    cap.restore();

    const lines = cap.lines();
    expect(lines).toHaveLength(1);
    expect(lines[0]!.level).toBe("error");
    expect(lines[0]!.status).toBe(500);
  });

  it("uses level 'info' for status < 500 (including 4xx)", () => {
    const cap = captureStdout();
    logRequest({
      method: "POST",
      route: "/api/v1/echo",
      status: 400,
      durationMs: 5,
      requestId: "req-400",
      via: "web",
    });
    cap.restore();

    const lines = cap.lines();
    expect(lines).toHaveLength(1);
    expect(lines[0]!.level).toBe("info");
  });
});

// ---------------------------------------------------------------------------
// 2. logJob unit tests
// ---------------------------------------------------------------------------

describe("logJob", () => {
  it("emits exactly one JSON line for a successful job run", () => {
    const started = new Date("2025-03-15T10:00:00.000Z").toISOString();
    const cap = captureStdout();
    logJob({
      name: "test-job",
      startedAt: started,
      durationMs: 123,
      ok: true,
    });
    cap.restore();

    const lines = cap.lines();
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line.event).toBe("job");
    expect(line.name).toBe("test-job");
    expect(line.startedAt).toBe(started);
    expect(line.durationMs).toBe(123);
    expect(line.ok).toBe(true);
    expect(line.level).toBe("info");
    expect(line.error).toBeUndefined();
    expect(typeof line.timestamp).toBe("string");
  });

  it("emits exactly one JSON line for a failing job run (with error field)", () => {
    const cap = captureStdout();
    logJob({
      name: "bad-job",
      startedAt: new Date().toISOString(),
      durationMs: 7,
      ok: false,
      error: "disk full",
    });
    cap.restore();

    const lines = cap.lines();
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line.event).toBe("job");
    expect(line.name).toBe("bad-job");
    expect(line.ok).toBe(false);
    expect(line.error).toBe("disk full");
    expect(line.level).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// 3. /api/v1 handler emits a request log per request
// ---------------------------------------------------------------------------

describe("/api/v1 handler request logging", () => {
  let apiKey: string;

  beforeAll(async () => {
    apiKey = await createUserWithApiKey("u-log-handler", "loghandler");
  });

  it("emits one log line with method, route, status, requestId, and via", async () => {
    const cap = captureStdout();
    const req = apiRequest("/ping?echo=hello", { bearer: apiKey });
    await GET(req);
    cap.restore();

    const requestLines = cap.lines().filter((l) => l.event === "request");
    expect(requestLines).toHaveLength(1);
    const log = requestLines[0]!;

    expect(log.method).toBe("GET");
    expect(typeof log.route).toBe("string");
    expect((log.route as string).includes("/api/v1")).toBe(true);
    expect(log.status).toBe(200);
    expect(typeof log.requestId).toBe("string");
    expect((log.requestId as string).length).toBeGreaterThan(0);
    expect(typeof log.via).toBe("string");
    expect((log.via as string).length).toBeGreaterThan(0);
    expect(typeof log.durationMs).toBe("number");
  });

  it("includes the API key name in the via field", async () => {
    const cap = captureStdout();
    const req = apiRequest("/ping", { bearer: apiKey });
    await GET(req);
    cap.restore();

    const requestLines = cap.lines().filter((l) => l.event === "request");
    expect(requestLines).toHaveLength(1);
    // createUserWithApiKey creates a key named "<username>-key"
    expect(requestLines[0]!.via).toBe("loghandler-key");
  });

  it("logs one line per request even for 401 (no bearer)", async () => {
    const cap = captureStdout();
    const req = apiRequest("/ping"); // no bearer
    await GET(req);
    cap.restore();

    const requestLines = cap.lines().filter((l) => l.event === "request");
    expect(requestLines).toHaveLength(1);
    expect(requestLines[0]!.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 4. requestId matches between log and error body for an internal error
// ---------------------------------------------------------------------------

describe("requestId matches between log line and error response body", () => {
  let apiKey: string;

  beforeAll(async () => {
    apiKey = await createUserWithApiKey("u-log-reqid", "logreqid");
  });

  it("requestId in the log matches requestId in a validation error body (400)", async () => {
    const cap = captureStdout();
    const req = apiRequest("/echo", {
      method: "POST",
      bearer: apiKey,
      body: { message: "" }, // triggers validation_error
    });
    const res = await POST(req);
    cap.restore();

    const body = (await res.json()) as {
      error: { code: string; requestId: string };
    };
    const requestIdFromBody = body.error.requestId;

    const requestLines = cap.lines().filter((l) => l.event === "request");
    expect(requestLines).toHaveLength(1);
    const log = requestLines[0]!;

    expect(requestIdFromBody).toBeTruthy();
    expect(log.requestId).toBe(requestIdFromBody);
    expect(log.status).toBe(400);
  });

  it("requestId in the log matches requestId in an internal error body (500)", async () => {
    // Use the throwInternal test procedure added to the router for exactly
    // this purpose (per design D20 and the service-api spec error model).
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const cap = captureStdout();
    const req = apiRequest("/test/throw-internal", { bearer: apiKey });
    const res = await GET(req);
    cap.restore();
    consoleErrorSpy.mockRestore();

    expect(res.status).toBe(500);

    const body = (await res.json()) as {
      error: { code: string; requestId: string };
    };
    expect(body.error.code).toBe("internal_error");

    const requestIdFromBody = body.error.requestId;
    expect(requestIdFromBody).toBeTruthy();

    const requestLines = cap.lines().filter((l) => l.event === "request");
    expect(requestLines).toHaveLength(1);
    const log = requestLines[0]!;

    // The requestId in the structured log line MUST match the one in the body.
    expect(log.requestId).toBe(requestIdFromBody);
    expect(log.status).toBe(500);
    expect(log.level).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// 5. tick() emits job log lines
// ---------------------------------------------------------------------------

describe("tick job logging", () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = createTestDatabase();
    setConnection(testDb.connection);
    _clearJobs();
  });

  afterEach(() => {
    setConnection(null);
    testDb.connection.close();
    const g = globalThis as Record<string, unknown>;
    g.__hearthSchedulerStarted = false;
    g.__hearthSchedulerInterval = undefined;
  });

  it("emits one job log line per job that ran", async () => {
    registerJob({
      name: "logger-test-job-a",
      frequency: "every-tick",
      run: () => {},
    });
    registerJob({
      name: "logger-test-job-b",
      frequency: "every-tick",
      run: () => {},
    });

    const cap = captureStdout();
    await tick(new Date("2025-03-15T10:00:00Z"));
    cap.restore();

    const jobLines = cap.lines().filter((l) => l.event === "job");

    const jobA = jobLines.find((l) => l.name === "logger-test-job-a");
    const jobB = jobLines.find((l) => l.name === "logger-test-job-b");

    expect(jobA).toBeDefined();
    expect(jobA!.ok).toBe(true);
    expect(jobA!.level).toBe("info");
    expect(typeof jobA!.durationMs).toBe("number");
    expect(typeof jobA!.startedAt).toBe("string");

    expect(jobB).toBeDefined();
    expect(jobB!.ok).toBe(true);
  });

  it("emits a job log line with ok:false and error message for a failing job", async () => {
    registerJob({
      name: "logger-test-fail-job",
      frequency: "every-tick",
      run: () => {
        throw new Error("simulated job failure");
      },
    });

    // Suppress the console.error from the jobs isolation handler
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const cap = captureStdout();
    await tick(new Date("2025-03-15T10:00:00Z"));
    cap.restore();
    consoleErrorSpy.mockRestore();

    const jobLines = cap.lines().filter((l) => l.event === "job");
    const failLine = jobLines.find(
      (l) => l.name === "logger-test-fail-job",
    );

    expect(failLine).toBeDefined();
    expect(failLine!.ok).toBe(false);
    expect(failLine!.level).toBe("error");
    expect(failLine!.error).toBe("simulated job failure");
  });

  it("does not suppress the existing job-isolation test: a failing job still lets others run", async () => {
    const ran: string[] = [];

    registerJob({
      name: "logger-isolation-fail",
      frequency: "every-tick",
      run: () => {
        throw new Error("fail");
      },
    });
    registerJob({
      name: "logger-isolation-ok",
      frequency: "every-tick",
      run: () => {
        ran.push("ok");
      },
    });

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const cap = captureStdout();
    await tick(new Date("2025-03-15T10:00:00Z"));
    cap.restore();
    consoleErrorSpy.mockRestore();

    // The ok job still ran despite the failing job
    expect(ran).toContain("ok");

    // Both jobs have log lines
    const jobLines = cap.lines().filter((l) => l.event === "job");
    const failLine = jobLines.find((l) => l.name === "logger-isolation-fail");
    const okLine = jobLines.find((l) => l.name === "logger-isolation-ok");
    expect(failLine).toBeDefined();
    expect(okLine).toBeDefined();
  });

  it("daily jobs skipped today do NOT emit a log line", async () => {
    registerJob({
      name: "logger-test-daily",
      frequency: "daily",
      run: () => {},
    });

    const now = new Date("2025-03-15T10:00:00Z");

    // First tick: daily job runs, should log
    const cap1 = captureStdout();
    await tick(now);
    cap1.restore();
    const firstRun = cap1
      .lines()
      .filter((l) => l.event === "job" && l.name === "logger-test-daily");
    expect(firstRun).toHaveLength(1);

    // Second tick same day: daily job is skipped, should NOT log
    const cap2 = captureStdout();
    await tick(new Date("2025-03-15T14:00:00Z"));
    cap2.restore();
    const secondRun = cap2
      .lines()
      .filter((l) => l.event === "job" && l.name === "logger-test-daily");
    expect(secondRun).toHaveLength(0);
  });

  it("emits a requestId-independent tick: log lines have startedAt and durationMs", async () => {
    registerJob({
      name: "logger-fields-check",
      frequency: "every-tick",
      run: () => {},
    });

    const cap = captureStdout();
    await tick(new Date("2025-03-15T12:00:00.000Z"));
    cap.restore();

    const jobLine = cap
      .lines()
      .find((l) => l.event === "job" && l.name === "logger-fields-check");
    expect(jobLine).toBeDefined();
    // startedAt must be a valid ISO string
    expect(new Date(jobLine!.startedAt as string).toISOString()).toBe(
      jobLine!.startedAt,
    );
    // durationMs must be a non-negative number
    expect(jobLine!.durationMs).toBeGreaterThanOrEqual(0);
    // event, name, ok, level, timestamp all present
    expect(jobLine!.event).toBe("job");
    expect(jobLine!.ok).toBe(true);
    expect(jobLine!.level).toBe("info");
    expect(typeof jobLine!.timestamp).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// 6. logInternalError unit test
// ---------------------------------------------------------------------------

describe("logInternalError", () => {
  it("emits one JSON line with requestId, error, and stack", async () => {
    const { logInternalError } = await import("./logger");
    const cap = captureStdout();
    logInternalError({
      requestId: "req-internal-123",
      error: "Something exploded",
      stack: "Error: Something exploded\n  at handler (file.ts:42:7)",
    });
    cap.restore();

    const lines = cap.lines();
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line.event).toBe("internal_error");
    expect(line.level).toBe("error");
    expect(line.requestId).toBe("req-internal-123");
    expect(line.error).toBe("Something exploded");
    expect(typeof line.stack).toBe("string");
  });

  it("omits the stack field when not provided", async () => {
    const { logInternalError } = await import("./logger");
    const cap = captureStdout();
    logInternalError({
      requestId: "req-nostack",
      error: "No stack available",
    });
    cap.restore();

    const lines = cap.lines();
    expect(lines).toHaveLength(1);
    expect(lines[0]!.stack).toBeUndefined();
  });
});
