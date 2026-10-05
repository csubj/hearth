/**
 * Tests for the pins procedures (task 13.4, design D8).
 *
 *  - pin    marks an entity as pinned for the current member.
 *  - unpin  removes the member's pin.
 *  - listPinned returns only the current member's pinned entities.
 *  - isPinned reflects the member's own pin state.
 *  - Pins are per-user: Sam's pins never appear in CJ's list.
 */

import "server-only";
import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "file::memory:?cache=shared";
});

import { randomUUID } from "node:crypto";
import { createRouterClient } from "@orpc/server";

import { validationInterceptor } from "../orpc";
import type { AppContext } from "../context";
import { router } from "../router";
import { db, sqlite } from "../../db";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { MIGRATIONS_FOLDER } from "../../db/testing";

const PREFIX = randomUUID().slice(0, 8);
const CJ = `u-cj-${PREFIX}`;
const SAM = `u-sam-${PREFIX}`;

beforeAll(() => {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  insertUser(CJ, "CJ", "cj", "admin");
  insertUser(SAM, "Sam", "sam", "user");
});

beforeEach(() => {
  sqlite.prepare("DELETE FROM entities").run();
  sqlite.prepare("DELETE FROM pins").run();
});

function insertUser(id: string, name: string, username: string, role: string) {
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO user
       (id, name, email, email_verified, created_at, updated_at, username, role, banned)
       VALUES (?, ?, ?, 0, unixepoch()*1000, unixepoch()*1000, ?, ?, 0)`,
    )
    .run(id, name, `${username}-${PREFIX}@users.hearth.invalid`, username, role);
}

function insertEntity(id: string, type = "notes-page") {
  sqlite
    .prepare(
      `INSERT INTO entities
       (id, type, title, version, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, unixepoch()*1000, unixepoch()*1000)`,
    )
    .run(id, type, `Entity ${id}`, CJ, CJ);
}

function ctx(userId = CJ): AppContext {
  return {
    user: {
      id: userId,
      name: userId === CJ ? "CJ" : "Sam",
      email: `${userId}@users.hearth.invalid`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    via: "web",
    now: Date.now(),
    requestId: `req-${randomUUID()}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function clientFor(userId = CJ) {
  return createRouterClient(router, {
    context: () => Promise.resolve(ctx(userId)),
    interceptors: [validationInterceptor],
  });
}

describe("pins", () => {
  it("pin then isPinned is true and listPinned contains it", async () => {
    const id = `e-${randomUUID()}`;
    insertEntity(id);
    const cj = clientFor(CJ);

    await cj.entityPin({ id });
    const state = await cj.entityIsPinned({ id });
    expect(state.pinned).toBe(true);

    const list = await cj.listPinned({});
    expect(list.data.map((x: { id: string }) => x.id)).toContain(id);
  });

  it("unpin removes it from listPinned", async () => {
    const id = `e-${randomUUID()}`;
    insertEntity(id);
    const cj = clientFor(CJ);
    await cj.entityPin({ id });
    await cj.entityUnpin({ id });

    const state = await cj.entityIsPinned({ id });
    expect(state.pinned).toBe(false);
    const list = await cj.listPinned({});
    expect(list.data.map((x: { id: string }) => x.id)).not.toContain(id);
  });

  it("pins are per-user", async () => {
    const id = `e-${randomUUID()}`;
    insertEntity(id);
    await clientFor(CJ).entityPin({ id });

    // Sam never sees CJ's pin.
    const sam = clientFor(SAM);
    const samList = await sam.listPinned({});
    expect(samList.data.map((x: { id: string }) => x.id)).not.toContain(id);
    const samState = await sam.entityIsPinned({ id });
    expect(samState.pinned).toBe(false);
  });

  it("pinning a trashed entity is not_found", async () => {
    const id = `e-${randomUUID()}`;
    insertEntity(id);
    sqlite
      .prepare("UPDATE entities SET deleted_at = ? WHERE id = ?")
      .run(Date.now(), id);
    await expect(clientFor(CJ).entityPin({ id })).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
