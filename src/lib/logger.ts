/**
 * Structured JSON logger (task 4.4, design D20).
 *
 * Writes one newline-delimited JSON line per event to stdout. No dependencies.
 *
 * Exports:
 *   logRequest(fields)      — one line per API request
 *   logJob(fields)          — one line per job run
 *   logInternalError(fields)— one line for an unexpected server error (with stack)
 */

// ---------------------------------------------------------------------------
// Field shapes
// ---------------------------------------------------------------------------

export interface RequestLogFields {
  /** HTTP method (GET, POST, …) */
  method: string;
  /** URL path (e.g. /api/v1/ping) */
  route: string;
  /** HTTP response status code */
  status: number;
  /** Elapsed milliseconds from request start to response */
  durationMs: number;
  /** The per-request UUID from the oRPC context */
  requestId: string;
  /** "web" for session callers, or the API key name for bearer callers */
  via: string;
}

export interface JobLogFields {
  /** Registered job name */
  name: string;
  /** ISO timestamp when the job started */
  startedAt: string;
  /** Elapsed milliseconds for the job run */
  durationMs: number;
  /** true if the job completed without throwing */
  ok: boolean;
  /** Error message when ok is false */
  error?: string;
}

export interface InternalErrorLogFields {
  /** The per-request UUID that also appears in the error body */
  requestId: string;
  /** Error.message */
  error: string;
  /** Error.stack (when available) */
  stack?: string;
}

// ---------------------------------------------------------------------------
// Internal emitter
// ---------------------------------------------------------------------------

interface LogRecord {
  timestamp: string;
  level: "info" | "error";
  event: "request" | "job" | "internal_error";
  [key: string]: unknown;
}

/** Write one JSON line to stdout. */
function emit(record: LogRecord): void {
  process.stdout.write(JSON.stringify(record) + "\n");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Log one API request.
 *
 * Call after the response is ready. Status >= 500 is logged at "error" level.
 */
export function logRequest(fields: RequestLogFields): void {
  emit({
    timestamp: new Date().toISOString(),
    level: fields.status >= 500 ? "error" : "info",
    event: "request",
    method: fields.method,
    route: fields.route,
    status: fields.status,
    durationMs: fields.durationMs,
    requestId: fields.requestId,
    via: fields.via,
  });
}

/**
 * Log one job run (success or failure).
 *
 * Failures are logged at "error" level; successes at "info".
 */
export function logJob(fields: JobLogFields): void {
  const record: LogRecord & Partial<JobLogFields> = {
    timestamp: new Date().toISOString(),
    level: fields.ok ? "info" : "error",
    event: "job",
    name: fields.name,
    startedAt: fields.startedAt,
    durationMs: fields.durationMs,
    ok: fields.ok,
  };
  if (fields.error !== undefined) {
    record.error = fields.error;
  }
  emit(record);
}

/**
 * Log an unexpected server error with its stack trace.
 *
 * The `requestId` ties this entry to the structured request log line and to
 * the `requestId` field in the error response body (design D20, service-api
 * spec: "their requestId MUST match the server log entry").
 */
export function logInternalError(fields: InternalErrorLogFields): void {
  const record: LogRecord & Partial<InternalErrorLogFields> = {
    timestamp: new Date().toISOString(),
    level: "error",
    event: "internal_error",
    requestId: fields.requestId,
    error: fields.error,
  };
  if (fields.stack !== undefined) {
    record.stack = fields.stack;
  }
  emit(record);
}
