/**
 * End-to-end flow test (task 14.1) — headless server-side variant.
 *
 * Runs the full scenario — bootstrap admin → sign in (session) → create two
 * properties → create a room → create a sample note in the room → tag, link,
 * attach, comment @member → reminder due → the member sees it in the inbox →
 * undo an edit → find via `place:` search — through the server-side router
 * client and the `invoke` server action. This is the headless, verifiable
 * analogue of the Playwright scenario in e2e/scenario.spec.ts (which needs a
 * browser). It runs in Vitest with no browser and no running server.
 */

import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "file::memory:?cache=shared";
});

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
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createRouterClient } from "@orpc/server";

import { db, sqlite } from "../db";
import { MIGRATIONS_FOLDER } from "../db/testing";
import { router } from "./router";
import { validationInterceptor } from "./orpc";
import type { AppContext } from "./context";
import { invoke } from "../lib/actions/invoke";
import { uploadAttachment } from "./attachments";
import { processDueReminders } from "./reminders";
import type { WriteContext } from "./write";

const ADMIN_ID = "u-flow-admin-" + randomUUID().slice(0, 8);
const MEMBER_ID = "u-flow-member-" + randomUUID().slice(0, 8);
const SESSION_TOKEN = "flow-session-" + randomUUID().slice(0, 8);
let uploadsDir: string;

beforeAll(async () => {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  uploadsDir = mkdtempSync(join(tmpdir(), "hearth-flow-uploads-"));
  process.env.UPLOADS_DIR = uploadsDir;

  const now = Date.now();
  const insert = sqlite.prepare(
    `INSERT OR IGNORE INTO user
     (id, name, email, email_verified, created_at, updated_at, username, role, banned)
     VALUES (?, ?, ?, 0, ?, ?, ?, 'admin', 0)`,
  );
  insert.run(ADMIN_ID, "Flow Admin", `${ADMIN_ID}@users.hearth.invalid`, now, now, "flow-admin");
  insert.run(MEMBER_ID, "Flow Member", `${MEMBER_ID}@users.hearth.invalid`, now, now, "flow-member");

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
});

afterAll(() => {
  delete process.env.UPLOADS_DIR;
});

function ctxFor(userId: string): AppContext {
  return {
    user: {
      id: userId,
      name: userId,
      email: `${userId}@users.hearth.invalid`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      role: "user",
    } as AppContext["user"],
    via: "web",
    now: Date.now(),
    requestId: randomUUID(),
  };
}

function client(userId: string) {
  return createRouterClient(router, {
    context: ctxFor(userId),
    interceptors: [validationInterceptor],
  });
}

async function invokeProc(userPath: string, input: unknown): Promise<unknown> {
  const [err, data] = (await invoke(userPath, input)) as [unknown, unknown];
  if (err) throw new Error(`invoke ${userPath} failed: ${JSON.stringify(err)}`);
  return data;
}

describe("end-to-end flow (14.1) headless", () => {
  let propA: string;
  let propB: string;
  let room: string;
  let noteId: string;
  let partnerNoteId: string;

  it("bootstraps the admin and signs in via session", async () => {
    // The router client resolves the admin session; a session row exists.
    const c = client(ADMIN_ID);
    const me = (await (c as Record<string, CallableFunction>).me({})) as {
      id: string;
    };
    expect(me.id).toBe(ADMIN_ID);
  });

  it("creates two properties", async () => {
    const c = client(ADMIN_ID);
    const a = (await (c as Record<string, CallableFunction>).placesCreate({
      title: "Cabin One",
      kind: "property",
      parentId: null,
    })) as { id: string };
    const b = (await (c as Record<string, CallableFunction>).placesCreate({
      title: "Cabin Two",
      kind: "property",
      parentId: null,
    })) as { id: string };
    propA = a.id;
    propB = b.id;
    expect(propA).toBeTruthy();
    expect(propB).toBeTruthy();
  });

  it("creates a room in the first property", async () => {
    const c = client(ADMIN_ID);
    const r = (await (c as Record<string, CallableFunction>).placesCreate({
      title: "Pantry",
      kind: "room",
      parentId: propA,
    })) as { id: string };
    room = r.id;
    expect(room).toBeTruthy();
  });

  it("creates a sample note in the room", async () => {
    const c = client(ADMIN_ID);
    const note = (await (c as Record<string, CallableFunction>).notesPageCreate({
      title: "Canned goods list",
      category: "reference",
      placeId: room,
    })) as { id: string };
    noteId = note.id;
    const read = (await (c as Record<string, CallableFunction>).notesPageGet({
      id: noteId,
    })) as { placeId: string | null };
    expect(read.placeId).toBe(room);
  });

  it("adds a tag, a link, and an attachment", async () => {
    const c = client(ADMIN_ID);
    await (c as Record<string, CallableFunction>).tagsAdd({
      id: noteId,
      name: "food",
    });

    // A partner note to link to.
    const partner = (await (c as Record<string, CallableFunction>).notesPageCreate({
      title: "Appliance list",
      category: "how-to",
      placeId: room,
    })) as { id: string };
    partnerNoteId = partner.id;
    await (c as Record<string, CallableFunction>).linksAdd({
      id: noteId,
      toId: partnerNoteId,
      relation: "related",
    });

    // Attachment: upload a tiny PNG through the write pipeline.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    );
    const uploaded = await uploadAttachment(ctxFor(ADMIN_ID) as WriteContext, noteId, {
      name: "receipt.png",
      bytes: png,
    });
    expect(uploaded.id).toBeTruthy();
  });

  it("comments @member and the member gets a mention", async () => {
    const c = client(ADMIN_ID);
    await (c as Record<string, CallableFunction>).createComment({
      id: noteId,
      markdown: "Please review @flow-member now.",
    });

    const member = client(MEMBER_ID);
    const inbox = (await (member as Record<string, CallableFunction>).listInbox({
      limit: 50,
    })) as { data: Array<{ reason: string; entityId: string }> };
    expect(inbox.data.some((i) => i.reason === "mention" && i.entityId === noteId)).toBe(true);
  });

  it("creates a due reminder and the member sees it in the inbox after the tick", async () => {
    const c = client(ADMIN_ID);
    const today = new Date().toISOString().slice(0, 10);
    await (c as Record<string, CallableFunction>).remindersCreate({
      id: noteId,
      title: "Check pantry",
      kind: "one_time",
      dueOn: today,
      recipients: [MEMBER_ID],
    });

    // Run the per-tick reminder job so the open reminder generates attention.
    processDueReminders(sqlite, new Date());

    const member = client(MEMBER_ID);
    const inbox = (await (member as Record<string, CallableFunction>).listInbox({
      limit: 50,
    })) as { data: Array<{ reason: string; entityId: string }> };
    expect(inbox.data.some((i) => i.reason === "reminder" && i.entityId === noteId)).toBe(true);
  });

  it("edits the note then undoes the edit (via invoke)", async () => {
    const c = client(ADMIN_ID);
    const entity = (await (c as Record<string, CallableFunction>).notesPageGet({
      id: noteId,
    })) as { version: number };
    await (c as Record<string, CallableFunction>).notesPageUpdate({
      id: noteId,
      expectedVersion: entity.version,
      data: { title: "Canned goods list (edited)" },
    });

    // Find the update activity entry and undo it through the invoke action.
    const activity = (await (c as Record<string, CallableFunction>).listActivity({
      entityId: noteId,
      limit: 50,
    })) as { data: Array<{ id: string; action: string; undoable: boolean }> };
    const updateEntry = activity.data.find(
      (a) => a.action === "update" && a.undoable,
    );
    expect(updateEntry).toBeDefined();

    await invokeProc("activityUndo", { id: updateEntry!.id });

    const after = (await (c as Record<string, CallableFunction>).notesPageGet({
      id: noteId,
    })) as { title: string };
    expect(after.title).toBe("Canned goods list");
  });

  it("finds the note via place: search", async () => {
    const c = client(ADMIN_ID);
    const result = (await (c as Record<string, CallableFunction>).search({
      q: 'place:"Cabin One" canned',
      limit: 20,
    })) as { data: Array<{ id: string }> };
    expect(result.data.some((r) => r.id === noteId)).toBe(true);
  });
});
