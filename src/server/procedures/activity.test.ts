/**
 * Tests for activity feed and undo (tasks 10.1–10.2, design D8/D12).
 *
 *  - Activity feed shows actor + channel attribution ("CJ via Claude").
 *  - Activity entries do NOT create attention items / bell increments.
 *  - Undo reverses create→trash, update→restore fields, notes edit, archive,
 *    delete, tags/assignees/links set deltas, and attachment removal.
 *  - Undo refuses (conflict) when the affected values no longer hold what the
 *    change produced, and is recorded (not redoable).
 */

import "server-only";
import { vi, describe, it, expect, beforeAll } from "vitest";

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
import { uploadAttachment } from "../attachments";
import type { WriteContext } from "../write";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Global setup — in-memory DB + three users
// ---------------------------------------------------------------------------

const PREFIX = randomUUID().slice(0, 8);
const CJ = `u-cj-${PREFIX}`;
const SAM = `u-sam-${PREFIX}`;
const UPLOADS_DIR = join(tmpdir(), `hearth-uploads-act-${PREFIX}`);

beforeAll(() => {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  insertUser(CJ, "CJ", "cj", "admin");
  insertUser(SAM, "Sam", "sam", "user");
  process.env.UPLOADS_DIR = UPLOADS_DIR;
  try {
    mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
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

function ctx(userId = CJ, via: AppContext["via"] = "web"): AppContext {
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
    via,
    now: Date.now(),
    requestId: randomUUID(),
  };
}

function client(userId = CJ, via: AppContext["via"] = "web") {
  return createRouterClient(router, {
    context: ctx(userId, via),
    interceptors: [validationInterceptor],
  });
}

type Client = ReturnType<typeof client>;

async function proc(c: Client, key: string, input: Record<string, unknown>) {
  return (c as Record<string, CallableFunction>)[key](input);
}

async function createNote(clientC = client(), title = "Note"): Promise<string> {
  const res = (await proc(clientC, "notesPageCreate", { title })) as { id: string };
  return res.id;
}

function getActivity(entityId?: string) {
  const input = entityId ? { entityId } : {};
  return proc(client(), "listActivity", input) as Promise<{
    data: Array<{
      id: string;
      actorName: string;
      viaLabel: string | null;
      action: string;
      undoable: boolean;
      diff: Record<string, unknown>;
    }>;
    nextCursor: string | null;
  }>;
}

function countUnread(userId: string): number {
  const row = sqlite
    .prepare(
      `SELECT COUNT(*) AS c FROM attention at JOIN entities e ON e.id = at.entity_id
       WHERE at.user_id = ? AND at.resolved_at IS NULL AND at.dismissed_at IS NULL
         AND at.read_at IS NULL AND e.deleted_at IS NULL`,
    )
    .get(userId) as { c: number };
  return row.c;
}

// ---------------------------------------------------------------------------
// 10.1 Activity feed
// ---------------------------------------------------------------------------

describe("10.1 activity feed", () => {
  it("attributes a write made via an API key as 'via Claude'", async () => {
    const c = client(CJ, { apiKeyId: "key-claude", name: "Claude" });
    await createNote(c, "Agent Note");

    const feed = await getActivity();
    const entry = feed.data[0]!;
    expect(entry.actorName).toBe("CJ");
    expect(entry.viaLabel).toBe("Claude");
    expect(entry.action).toBe("create");
    expect(entry.undoable).toBe(true);
  });

  it("shows a web write with no via attribution", async () => {
    await createNote(client(), "Web Note");
    const feed = await getActivity();
    const entry = feed.data[0]!;
    expect(entry.viaLabel).toBeNull();
  });

  it("does not create attention items or bell increments for an ordinary edit", async () => {
    const id = await createNote();
    await proc(client(), "notesPageUpdate", {
      id,
      data: { title: "Renamed" },
    });
    expect(countUnread(SAM)).toBe(0);
    expect(countUnread(CJ)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 10.2 Undo
// ---------------------------------------------------------------------------

describe("10.2 undo", () => {
  it("undoes a create by trashing the entity", async () => {
    const id = await createNote();
    const feed = await getActivity(id);
    const createEntry = feed.data.find((e) => e.action === "create")!;

    const res = (await proc(client(), "activityUndo", { id: createEntry.id })) as {
      ok: boolean;
      undoId: string;
    };
    expect(res.ok).toBe(true);

    const row = sqlite
      .prepare("SELECT deleted_at FROM entities WHERE id = ?")
      .get(id) as { deleted_at: number | null };
    expect(row.deleted_at).not.toBeNull();
  });

  it("refuses to undo a create that is already trashed", async () => {
    const id = await createNote();
    const feed = await getActivity(id);
    const createEntry = feed.data.find((e) => e.action === "create")!;

    await proc(client(), "activityUndo", { id: createEntry.id });
    await expect(
      proc(client(), "activityUndo", { id: createEntry.id }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("undoes an update by restoring the prior field value", async () => {
    const id = await createNote();
    await proc(client(), "notesPageUpdate", { id, data: { title: "New Title" } });

    const feed = await getActivity(id);
    const updateEntry = feed.data.find((e) => e.action === "update")!;
    await proc(client(), "activityUndo", { id: updateEntry.id });

    const row = sqlite
      .prepare("SELECT title FROM entities WHERE id = ?")
      .get(id) as { title: string };
    expect(row.title).toBe("Note");
  });

  it("refuses an update undo after a later different change to the same field", async () => {
    const id = await createNote();
    await proc(client(), "notesPageUpdate", { id, data: { title: "First" } });
    const feed = await getActivity(id);
    // Select CJ's own update (diff title after = "First"); the later change is
    // by a different actor so it is a separate (non-coalesced) entry.
    const updateEntry = feed.data.find(
      (e) => e.action === "update" && (e.diff.fields as any)?.title?.[1] === "First",
    )!;

    // A later change (different actor) sets the same field to a different value.
    await proc(client(SAM), "notesPageUpdate", { id, data: { title: "Second" } });

    await expect(
      proc(client(), "activityUndo", { id: updateEntry.id }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("undoes a delete by restoring the entity from trash", async () => {
    const id = await createNote();
    await proc(client(), "notesPageDelete", { id });
    const feed = await getActivity(id);
    const deleteEntry = feed.data.find((e) => e.action === "delete")!;
    await proc(client(), "activityUndo", { id: deleteEntry.id });

    const row = sqlite
      .prepare("SELECT deleted_at FROM entities WHERE id = ?")
      .get(id) as { deleted_at: number | null };
    expect(row.deleted_at).toBeNull();
  });

  it("undoes an archive by unarchiving", async () => {
    const id = await createNote();
    await proc(client(), "notesPageArchive", { id });
    const feed = await getActivity(id);
    const archiveEntry = feed.data.find((e) => e.action === "archive")!;
    await proc(client(), "activityUndo", { id: archiveEntry.id });

    const row = sqlite
      .prepare("SELECT archived_at FROM entities WHERE id = ?")
      .get(id) as { archived_at: number | null };
    expect(row.archived_at).toBeNull();
  });

  it("undoes a notes edit by restoring the previous document", async () => {
    const id = await createNote();
    // CJ writes v1; Sam (different actor, so no coalescing) writes v2.
    await proc(client(), "saveNotes", { id, markdown: "first version" });
    await proc(client(SAM), "saveNotes", { id, markdown: "second version" });
    const feed = await getActivity(id);
    // Select Sam's edit (notes.prevMarkdown === "first version") to undo it.
    const updateEntry = feed.data.find(
      (e) => (e.diff.notes as any)?.prevMarkdown === "first version",
    )!;

    // Undo Sam's edit → restore v1.
    await proc(client(), "activityUndo", { id: updateEntry.id });

    const row = sqlite
      .prepare("SELECT markdown FROM notes WHERE entity_id = ?")
      .get(id) as { markdown: string };
    expect(row.markdown).toBe("first version");
  });

  it("undoes adding one tag while another tag stays", async () => {
    const id = await createNote();
    const kitchen = (await proc(client(), "tagsAdd", { id, name: "kitchen" })) as {
      tagId: string;
    };
    await proc(client(), "tagsAdd", { id, name: "paint" });

    const feed = await getActivity(id);
    // Select the specific "add kitchen" entry.
    const tagEntry = feed.data.find((e) =>
      ((e.diff.sets as any)?.tags?.added ?? []).includes(kitchen.tagId),
    )!;
    await proc(client(), "activityUndo", { id: tagEntry.id });

    const tags = (await proc(client(), "tagsList", { id })) as {
      data: Array<{ id: string; name: string }>;
    };
    const names = tags.data.map((t) => t.name);
    // kitchen was added first (the undone entry); paint stays.
    expect(names).toContain("paint");
    expect(names).not.toContain("kitchen");
  });

  it("is recorded as its own undo entry and is not itself undoable", async () => {
    const id = await createNote();
    const feed = await getActivity(id);
    const createEntry = feed.data.find((e) => e.action === "create")!;
    const res = (await proc(client(), "activityUndo", { id: createEntry.id })) as {
      undoId: string;
    };

    const after = await getActivity(id);
    const undoEntry = after.data.find((e) => e.id === res.undoId)!;
    expect(undoEntry.action).toBe("undo");
    expect(undoEntry.undoable).toBe(false);

    // Cannot undo the undo (no redo).
    await expect(
      proc(client(), "activityUndo", { id: res.undoId }),
    ).rejects.toMatchObject({ code: "conflict" });

    // The undone create is no longer undoable.
    const afterCreate = after.data.find((e) => e.action === "create")!;
    expect(afterCreate.undoable).toBe(false);
  });

  it("restores a removed attachment", async () => {
    const id = await createNote();
    await uploadAttachment(
      ctx() as WriteContext,
      id,
      { name: "photo.jpg", bytes: tinyJpeg() },
    );
    const atts = (await proc(client(), "attachmentsList", { id })) as {
      data: Array<{ id: string; deletedAt: number | null }>;
    };
    const att = atts.data.find((a) => a.deletedAt === null)!;
    await proc(client(), "attachmentsRemove", { id, attachmentId: att.id });

    const feed = await getActivity(id);
    const removeEntry = feed.data.find((e) => e.action === "remove-attachment")!;
    await proc(client(), "activityUndo", { id: removeEntry.id });

    const atts2 = (await proc(client(), "attachmentsList", { id })) as {
      data: Array<{ id: string; deletedAt: number | null }>;
    };
    const restored = atts2.data.find((a) => a.id === att.id)!;
    expect(restored.deletedAt).toBeNull();
  });
});

/** Minimal valid JPEG bytes (magic FF D8 FF + trailing FF D9). */
function tinyJpeg(): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff]),
    Buffer.from("JFIF".split("").map((c) => c.charCodeAt(0))),
    Buffer.from([0xff, 0xd9]),
  ]);
}
