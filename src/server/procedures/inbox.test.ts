/**
 * Tests for the inbox and bell (task 10.3, design D8).
 *
 *  - The bell count reflects unread open attention items only.
 *  - Mark read, mark all read, and dismiss update the item / count.
 *  - Items about trashed entities are hidden from both the inbox and the count.
 *  - Only mentions of / assignments to the member create their items.
 */

import "server-only";
import { vi, describe, it, expect, beforeAll } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "file::memory:?cache=shared";
});

import { randomUUID } from "node:crypto";
import { createRouterClient } from "@orpc/server";
import { beforeEach } from "vitest";

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

// The shared in-memory DB persists across tests in this file; reset entity
// data (cascading to activity/attention) between cases so counts are isolated.
beforeEach(() => {
  sqlite.prepare("DELETE FROM entities").run();
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

function ctx(userId = CJ): AppContext {
  return {
    user: {
      id: userId,
      name: userId === CJ ? "CJ" : "Sam",
      email: `${userId}@users.hearth.invalid`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      role: userId === CJ ? "admin" : "user",
    } as AppContext["user"],
    via: "web",
    now: Date.now(),
    requestId: randomUUID(),
  };
}

function client(userId = CJ) {
  return createRouterClient(router, {
    context: ctx(userId),
    interceptors: [validationInterceptor],
  });
}

type Client = ReturnType<typeof client>;

async function proc(c: Client, key: string, input: Record<string, unknown>) {
  return (c as Record<string, CallableFunction>)[key](input);
}

async function createNote(c = client()): Promise<string> {
  const res = (await proc(c, "notesPageCreate", { title: "Note" })) as { id: string };
  return res.id;
}

async function bellCount(userId = SAM): Promise<number> {
  const res = (await proc(client(userId), "inboxCount", {})) as { count: number };
  return res.count;
}

async function inboxList(userId = SAM) {
  return (await proc(client(userId), "listInbox", {})) as {
    data: Array<{ id: string; reason: string; entityId: string }>;
  };
}

describe("10.3 inbox and bell", () => {
  it("creates an inbox item for a mention and bumps the bell count", async () => {
    const c = client(CJ);
    const id = await createNote(c);
    await proc(c, "saveNotes", { id, markdown: "@sam please review" });

    expect(await bellCount(SAM)).toBe(1);
    const inbox = await inboxList(SAM);
    expect(inbox.data).toHaveLength(1);
    expect(inbox.data[0]!.reason).toBe("mention");
    expect(inbox.data[0]!.entityId).toBe(id);
  });

  it("does not create an attention item or bell bump for an ordinary edit (no mention/assign)", async () => {
    const c = client(CJ);
    const id = await createNote(c);
    await proc(c, "notesPageUpdate", { id, data: { title: "Renamed" } });
    // No other member (Sam) is notified.
    expect(await bellCount(SAM)).toBe(0);
    // The editor (CJ) is not notified either.
    expect(await bellCount(CJ)).toBe(0);
  });

  it("mark read drops an item from the unread bell count but keeps it in the inbox", async () => {
    const c = client(CJ);
    const id = await createNote(c);
    await proc(c, "saveNotes", { id, markdown: "@sam please review" });

    expect(await bellCount(SAM)).toBe(1);
    const inbox = await inboxList(SAM);
    const item = inbox.data[0]!;
    await proc(client(SAM), "inboxMarkRead", { id: item.id });

    expect(await bellCount(SAM)).toBe(0);
    // Still present (read) in the inbox list.
    const after = await inboxList(SAM);
    expect(after.data.some((i) => i.id === item.id)).toBe(true);
  });

  it("dismiss removes the item and clears the bell count", async () => {
    const c = client(CJ);
    const id = await createNote(c);
    await proc(c, "saveNotes", { id, markdown: "@sam please review" });

    const inbox = await inboxList(SAM);
    const item = inbox.data[0]!;
    await proc(client(SAM), "inboxDismiss", { id: item.id });

    expect(await bellCount(SAM)).toBe(0);
    const after = await inboxList(SAM);
    expect(after.data.some((i) => i.id === item.id)).toBe(false);
  });

  it("mark all read clears the bell count", async () => {
    const c = client(CJ);
    const id1 = await createNote(c);
    const id2 = await createNote(c);
    await proc(c, "saveNotes", { id: id1, markdown: "@sam one" });
    await proc(c, "saveNotes", { id: id2, markdown: "@sam two" });

    expect(await bellCount(SAM)).toBe(2);
    await proc(client(SAM), "inboxMarkAllRead", {});
    expect(await bellCount(SAM)).toBe(0);
  });

  it("hides items about trashed entities from the inbox and the count", async () => {
    const c = client(CJ);
    const id = await createNote(c);
    await proc(c, "saveNotes", { id, markdown: "@sam please review" });
    expect(await bellCount(SAM)).toBe(1);

    // Trash the entity → its items disappear.
    await proc(c, "notesPageDelete", { id });
    expect(await bellCount(SAM)).toBe(0);
    const inbox = await inboxList(SAM);
    expect(inbox.data.some((i) => i.entityId === id)).toBe(false);
  });
});
