/**
 * API smoke test (design D21, task 14.2).
 *
 * Exercises the REST surface through the real `/api/v1` OpenAPIHandler with a
 * bearer API key, verifying the sample module CRUD, a tag, a Markdown
 * comment, actor attribution ("via <key name>"), the OpenAPI document, and
 * that a replayed `Idempotency-Key` creates exactly one entity.
 *
 * Runs headless in Vitest (no browser, no running server).
 */

import { vi, describe, it, expect, beforeAll } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "file::memory:?cache=shared";
});

import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { db, sqlite } from "../db";
import { MIGRATIONS_FOLDER } from "../db/testing";
import { auth } from "./auth";
import { generateOpenApiDoc } from "./openapi";
import * as apiV1 from "../app/api/v1/[[...rest]]/route";

const ADMIN_ID = "u-smoke-" + randomUUID().slice(0, 8);
const KEY_NAME = "smoke-key";
let apiKey = "";

beforeAll(async () => {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO user
       (id, name, email, email_verified, created_at, updated_at, username, role)
       VALUES (?, ?, ?, 0, unixepoch()*1000, unixepoch()*1000, ?, 'admin')`,
    )
    .run(ADMIN_ID, "Smoke Admin", `${ADMIN_ID}@users.hearth.invalid`, ADMIN_ID.slice(0, 20));

  const keyResult = await auth.api.createApiKey({
    body: { userId: ADMIN_ID, name: KEY_NAME },
  });
  apiKey = (keyResult as Record<string, unknown>).key as string;
});

// ---------------------------------------------------------------------------
// HTTP helpers through the real /api/v1 handler
// ---------------------------------------------------------------------------

async function call(
  method: string,
  urlPath: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    ...headers,
  };
  let init: RequestInit = { method, headers: h };
  if (body !== undefined) {
    h["Content-Type"] = "application/json";
    init = { ...init, body: JSON.stringify(body) };
  }
  const req = new Request(`http://localhost${urlPath}`, init);
  const handler =
    (apiV1 as unknown as Record<string, (r: Request) => Promise<Response>>)[method] ??
    (apiV1 as unknown as Record<string, (r: Request) => Promise<Response>>).POST;
  return handler(req);
}

// ---------------------------------------------------------------------------
// 14.2 API smoke
// ---------------------------------------------------------------------------

describe("api smoke (14.2)", () => {
  let entityId: string;

  it("creates an entity in the sample module via /api/v1", async () => {
    const res = await call("POST", "/api/v1/notes-page", {
      title: "Smoke note",
      category: "reference",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      id: string;
      title: string;
      category: string | null;
    };
    expect(data.title).toBe("Smoke note");
    expect(data.category).toBe("reference");
    entityId = data.id;
  });

  it("reads, lists, and updates the entity", async () => {
    const getRes = await call("GET", `/api/v1/notes-page/${entityId}`);
    expect(getRes.status).toBe(200);
    expect(((await getRes.json()) as { id: string }).id).toBe(entityId);

    const listRes = await call("GET", "/api/v1/notes-page");
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { data: Array<{ id: string }> };
    expect(list.data.length).toBeGreaterThan(0);

    const patchRes = await call("PATCH", `/api/v1/notes-page/${entityId}`, {
      id: entityId,
      expectedVersion: 1,
      data: { title: "Smoke note updated" },
    });
    expect(patchRes.status).toBe(200);
    expect(((await patchRes.json()) as { title: string }).title).toBe(
      "Smoke note updated",
    );
  });

  it("adds a tag and a Markdown comment", async () => {
    const tagRes = await call("POST", `/api/v1/entities/${entityId}/tags`, {
      id: entityId,
      name: "urgent",
    });
    expect(tagRes.status).toBe(200);

    const commentRes = await call(
      "POST",
      `/api/v1/entities/${entityId}/comments`,
      { id: entityId, markdown: "Please review @seed-admin." },
    );
    expect(commentRes.status).toBe(200);
    const comment = (await commentRes.json()) as { markdown: string };
    expect(comment.markdown).toContain("@seed-admin");

    const comments = await call("GET", `/api/v1/entities/${entityId}/comments`);
    expect(comments.status).toBe(200);
    expect(
      ((await comments.json()) as { data: Array<{ markdown: string }> }).data,
    ).toHaveLength(1);
  });

  it("records the action as 'via <key name>'", async () => {
    const res = await call("GET", `/api/v1/activity?entityId=${entityId}`);
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as {
      data: Array<{ viaLabel: string | null; action: string }>;
    };
    const withVia = data.find((d) => d.action === "create");
    expect(withVia).toBeDefined();
    expect(withVia!.viaLabel).toBe(KEY_NAME);
  });

  it("generates an OpenAPI document covering the module and the error body", async () => {
    const doc = (await generateOpenApiDoc()) as {
      paths?: Record<string, unknown>;
      components?: {
        schemas?: Record<string, unknown>;
      };
    };
    const paths = Object.keys(doc.paths ?? {});
    expect(paths.some((p) => p.includes("notes-page"))).toBe(true);
    expect(doc.components?.schemas?.ErrorBody).toBeDefined();
  });

  it("a replayed Idempotency-Key creates exactly one entity", async () => {
    const payload = { title: "Idempotent note", category: "contacts" };
    const idemKey = "smoke-idempotency-" + randomUUID().slice(0, 8);

    const first = await call("POST", "/api/v1/notes-page", payload, {
      "Idempotency-Key": idemKey,
    });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { id: string };

    const second = await call("POST", "/api/v1/notes-page", payload, {
      "Idempotency-Key": idemKey,
    });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { id: string };

    // Same entity returned on replay.
    expect(secondBody.id).toBe(firstBody.id);

    // Exactly one entity with that title exists.
    const row = sqlite
      .prepare("SELECT COUNT(*) AS c FROM entities WHERE title = ?")
      .get("Idempotent note") as { c: number };
    expect(row.c).toBe(1);
  });

  it("rejects a replayed key with a different body as a conflict", async () => {
    const idemKey = "smoke-idem-conflict-" + randomUUID().slice(0, 8);
    await call("POST", "/api/v1/notes-page", { title: "First body" }, {
      "Idempotency-Key": idemKey,
    });
    const res = await call("POST", "/api/v1/notes-page", { title: "Second body" }, {
      "Idempotency-Key": idemKey,
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("conflict");
  });
});
