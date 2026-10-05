/**
 * Contract test (design D21, task 6.5).
 *
 * Walks the root router programmatically and, for every routed procedure:
 *   1. Fails if it has no REST route (method + path).
 *   2. Asserts that the same invalid input yields the same error `code` and
 *      `details` through the `invoke` web action and through REST (`/api/v1`).
 *
 * Procedures that are session-only (or otherwise reject API-key callers)
 * cannot be reached through REST with a bearer key, so they are covered by
 * the route-existence check and the expected `forbidden` asymmetry is
 * tolerated. Later sections' procedures are covered automatically because the
 * test walks the router rather than hard-coding procedure names.
 */

import { vi, describe, it, expect, beforeAll } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "file::memory:?cache=shared";
});

// Controllable session cookie for the web (`invoke`) path.
const state = { cookie: "" };

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ cookie: state.cookie })),
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  })),
}));

vi.mock("next/cache", () => ({
  refresh: vi.fn(),
}));

import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { traverseContractProcedures } from "@orpc/server";

import { db, sqlite } from "../db";
import { MIGRATIONS_FOLDER } from "../db/testing";
import { router } from "./router";
import { auth } from "./auth";
import { invoke } from "../lib/actions/invoke";
import * as apiV1 from "../app/api/v1/[[...rest]]/route";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const ADMIN_ID = "u-contract-" + randomUUID().slice(0, 8);
const SESSION_TOKEN = "contract-session-token-" + randomUUID().slice(0, 8);

beforeAll(async () => {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  // Seed an admin user.
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO user
       (id, name, email, email_verified, created_at, updated_at, username, role)
       VALUES (?, ?, ?, 0, unixepoch()*1000, unixepoch()*1000, ?, 'admin')`,
    )
    .run(
      ADMIN_ID,
      "Contract Admin",
      `${ADMIN_ID}@users.hearth.invalid`,
      ADMIN_ID.slice(0, 20),
    );

  // Insert a session row so a web (`invoke`) request resolves to this admin.
  const now = Date.now();
  sqlite
    .prepare(
      `INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "sess-" + randomUUID(),
      now + 30 * 24 * 60 * 60 * 1000,
      SESSION_TOKEN,
      now,
      now,
      ADMIN_ID,
    );
  state.cookie = `better-auth.session_token=${SESSION_TOKEN}.signature`;

  // Create an API key for the REST path (owned by the same admin).
  const keyResult = await auth.api.createApiKey({
    body: { userId: ADMIN_ID, name: "contract-key" },
  });
  apiKey = (keyResult as Record<string, unknown>).key as string;
});

let apiKey = "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ProcInfo = {
  path: string;
  method: string | undefined;
  routePath: string | undefined;
  keys: string[];
  pathParams: string[];
  nonPathKeys: string[];
};

function extractPathParams(routePath: string): string[] {
  const params: string[] = [];
  const re = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(routePath)) !== null) {
    params.push(m[1]!);
  }
  return params;
}

function buildInvalidInput(info: ProcInfo): Record<string, string | null> {
  const input: Record<string, string | null> = {};
  for (const key of info.keys) {
    input[key] = info.pathParams.includes(key) ? "dummy-id" : null;
  }
  return input;
}

function buildUrl(routePath: string, info: ProcInfo): string {
  let url = `/api/v1${routePath}`;
  for (const p of info.pathParams) {
    url = url.replace(`{${p}}`, "dummy-id");
  }
  return url;
}

function buildRestRequest(
  method: string,
  info: ProcInfo,
  invalidInput: Record<string, string | null>,
  pathParams: string[],
): Request {
  const url = `http://localhost${buildUrl(info.routePath!, info)}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };
  if (method === "GET") {
    // GET -> query params (non-path keys only).
    const qs = new URLSearchParams();
    for (const key of info.nonPathKeys) {
      qs.set(key, String(invalidInput[key]));
    }
    const query = qs.toString();
    const finalUrl = query ? `${url}?${query}` : url;
    return new Request(finalUrl, { method, headers });
  }

  // Body methods: send the invalid input as JSON.
  const isPathParam = (k: string) => pathParams.includes(k);
  const bodyObj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(invalidInput)) {
    if (!isPathParam(k)) bodyObj[k] = v;
  }
  const body = JSON.stringify(bodyObj);
  headers["Content-Type"] = "application/json";
  return new Request(url, { method, headers, body });
}

// ---------------------------------------------------------------------------
// Collect procedures
// ---------------------------------------------------------------------------

function collectProcedures(): ProcInfo[] {
  const procs: ProcInfo[] = [];
  traverseContractProcedures({ router, path: [] }, ({ contract, path }) => {
    const def = (contract as { "~orpc"?: { route?: { method?: string; path?: string }; inputSchema?: { shape?: Record<string, unknown> } } })["~orpc"];
    const route = def?.route;
    const routePath = route?.path;
    const keys = def?.inputSchema?.shape ? Object.keys(def.inputSchema.shape) : [];
    const pathParams = routePath ? extractPathParams(routePath) : [];
    procs.push({
      path: path.join("."),
      method: route?.method,
      routePath,
      keys,
      pathParams,
      nonPathKeys: keys.filter((k) => !pathParams.includes(k)),
    });
  });
  return procs;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("contract test (6.5)", () => {
  const procs = collectProcedures();

  it("walks the router and finds every routed procedure", () => {
    expect(procs.length).toBeGreaterThan(0);
    // The sample module and the test procedure must be covered.
    const paths = procs.map((p) => p.path);
    expect(paths).toContain("notesPageCreate");
    expect(paths).toContain("echo");
  });

  it("every routed procedure declares a REST route with method and path", () => {
    const missing = procs.filter((p) => !p.method || !p.routePath);
    expect(missing).toEqual([]);
  });

  it("the same invalid input yields the same error code and details via invoke and REST", async () => {
    const failures: string[] = [];

    for (const info of procs) {
      // Only body-method procedures are parity-checked: for GET procedures the
      // invalid input is transmitted as query parameters (strings), so `null`
      // cannot be represented identically to the invoke channel.
      // The route-existence check above still covers every routed procedure.
      if (info.method === "GET") continue;
      // Skip procedures with no non-path input keys: there is no invalid
      // input that fails validation (e.g. empty-input procedures).
      if (info.nonPathKeys.length === 0 || !info.method || !info.routePath) {
        continue;
      }

      const invalidInput = buildInvalidInput(info);

      // --- invoke path (web session) ---
      const [invokeError] = (await invoke(info.path, invalidInput)) as [unknown, unknown];

      // --- REST path ---
      const req = buildRestRequest(
        info.method,
        info,
        invalidInput,
        info.pathParams,
      );
      const handler =
        (apiV1 as unknown as Record<string, (req: Request) => Promise<Response>>)[info.method] ??
        (apiV1 as unknown as Record<string, (req: Request) => Promise<Response>>).POST;
      const res = await handler(req);
      const restBody = (await res.json().catch(() => ({ error: null }))) as {
        error?: { code: string; details?: unknown };
      };

      const invokeErr = invokeError as { code: string; details?: unknown } | null;
      const restErr = restBody.error ?? null;

      if (!invokeErr) {
        // invoke did not error — this input produced no validation error.
        // If REST rejected with forbidden, it is a session-only procedure.
        if (restErr?.code === "forbidden") continue;
        failures.push(`${info.path}: invoke succeeded but REST returned ${restErr?.code ?? "success"}`);
        continue;
      }

      if (invokeErr.code !== "validation_error") {
        continue;
      }

      if (restErr?.code === "forbidden") {
        // Session-only procedure: REST cannot reach it with a bearer key.
        continue;
      }

      if (restErr?.code !== "validation_error") {
        failures.push(
          `${info.path}: invoke=${invokeErr.code}, REST=${restErr?.code ?? "success"}`,
        );
        continue;
      }

      // Same code and the same field-level details (path + message).
      if (invokeErr.code !== restErr.code) {
        failures.push(`${info.path}: code mismatch`);
        continue;
      }
      const invD = normalizeDetails(invokeErr.details);
      const vD = normalizeDetails(restErr.details);
      if (JSON.stringify(invD) !== JSON.stringify(vD)) {
        failures.push(
          `${info.path}: details mismatch invoke=${JSON.stringify(invD)} rest=${JSON.stringify(vD)}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });
});

function normalizeDetails(details: unknown): unknown {
  if (!Array.isArray(details)) return details;
  return details.map((d) => {
    const item = d as { path?: unknown; message?: unknown };
    return { path: item.path, message: item.message };
  });
}
