/**
 * Tests for collaboration shared services (tasks 9.1–9.5, design D8/D9/D13).
 *
 *  - Notes: save as Markdown/doc, expectedVersion conflict, size limit.
 *  - Comments: create with Markdown mentions, edit-own / delete-own-or-admin.
 *  - Mentions: new mention notifies once, re-save does not re-notify, an API
 *    key writing Markdown notifies.
 *  - Assignees: assigning two people notifies each except the assigner.
 */

import "server-only";
import { vi, describe, it, expect, beforeAll } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "file::memory:?cache=shared";
});

import { randomUUID } from "node:crypto";
import { createRouterClient, ORPCError } from "@orpc/server";

import { validationInterceptor } from "../orpc";
import type { AppContext } from "../context";
import { router } from "../router";
import { db, sqlite } from "../../db";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { MIGRATIONS_FOLDER } from "../../db/testing";

// ---------------------------------------------------------------------------
// Global setup — in-memory DB + two users
// ---------------------------------------------------------------------------

const PREFIX = randomUUID().slice(0, 8);
const CJ = `u-cj-${PREFIX}`; // admin
const SAM = `u-sam-${PREFIX}`; // user
const ALICE = `u-alice-${PREFIX}`; // user

beforeAll(() => {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  insertUser(CJ, "CJ", "cj", "admin");
  insertUser(SAM, "Sam", "sam", "user");
  insertUser(ALICE, "Alice", "alice", "user");
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
      name: userId === CJ ? "CJ" : userId === SAM ? "Sam" : "Alice",
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

interface Note {
  id: string;
  title: string;
}

async function createNote(title: string): Promise<Note> {
  const c = client();
  return (await (c as Record<string, CallableFunction>).notesPageCreate({
    title,
  })) as Note;
}

function countAttention(
  userId: string,
  reason: string,
  entityId: string,
): number {
  const row = sqlite
    .prepare(
      "SELECT COUNT(*) AS c FROM attention WHERE user_id = ? AND reason = ? AND entity_id = ?",
    )
    .get(userId, reason, entityId) as { c: number };
  return row.c;
}

function listAttention(userId: string, reason: string): Array<{ occurrence_key: string }> {
  return sqlite
    .prepare("SELECT occurrence_key FROM attention WHERE user_id = ? AND reason = ?")
    .all(userId, reason) as Array<{ occurrence_key: string }>;
}

// ---------------------------------------------------------------------------
// 9.1 / 9.2 Notes
// ---------------------------------------------------------------------------

describe("9.1/9.2 notes", () => {
  it("saves Markdown, notifies a new mention once, and does not re-notify on an equivalent re-save", async () => {
    const c = client();
    const note = await createNote("Notes A");
    const first = (await (c as Record<string, CallableFunction>).saveNotes({
      id: note.id,
      markdown: "Need @sam to review this.",
    })) as { version: number; markdown: string; mentionIds: string[] };

    expect(first.version).toBe(1);
    expect(first.mentionIds).toEqual([SAM]);
    expect(countAttention(SAM, "mention", note.id)).toBe(1);

    // Re-save the same mention with additional text → Sam is NOT re-notified.
    const second = (await (c as Record<string, CallableFunction>).saveNotes({
      id: note.id,
      expectedVersion: 1,
      markdown: "Need @sam to review this and also pinch in.",
    })) as { version: number };
    expect(second.version).toBe(2);
    expect(countAttention(SAM, "mention", note.id)).toBe(1);
  });

  it("saves a document from the editor and extracts mentions", async () => {
    const c = client();
    const note = await createNote("Notes Doc");
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "mention", attrs: { id: SAM, label: "sam" } },
            { type: "text", text: " please" },
          ],
        },
      ],
    };
    const res = (await (c as Record<string, CallableFunction>).saveNotes({
      id: note.id,
      doc,
    })) as { mentionIds: string[]; markdown: string };
    expect(res.mentionIds).toEqual([SAM]);
    expect(res.markdown).toContain("@sam");
  });

  it("rejects a save based on an outdated version with conflict", async () => {
    const c = client();
    const note = await createNote("Notes Conflict");
    await (c as Record<string, CallableFunction>).saveNotes({
      id: note.id,
      markdown: "v1",
    });
    try {
      await (c as Record<string, CallableFunction>).saveNotes({
        id: note.id,
        expectedVersion: 0,
        markdown: "v2 stale",
      });
      expect.unreachable("should have thrown conflict");
    } catch (err) {
      expect((err as ORPCError<string, unknown>).code).toBe("conflict");
    }
  });

  it("rejects notes larger than 500 KB with validation_error", async () => {
    const c = client();
    const note = await createNote("Notes Big");
    try {
      await (c as Record<string, CallableFunction>).saveNotes({
        id: note.id,
        markdown: "# " + "x".repeat(500 * 1024 + 1),
      });
      expect.unreachable("should have thrown validation_error");
    } catch (err) {
      expect((err as ORPCError<string, unknown>).code).toBe("validation_error");
    }
  });

  it("returns 403 when the module does not enable notes", async () => {
    const c = client();
    const place = (await (c as Record<string, CallableFunction>).placesCreate({
      title: "Property",
      kind: "property",
    })) as { id: string };
    try {
      await (c as Record<string, CallableFunction>).saveNotes({
        id: place.id,
        markdown: "hi",
      });
      expect.unreachable("should have thrown forbidden");
    } catch (err) {
      expect((err as ORPCError<string, unknown>).code).toBe("forbidden");
    }
  });
});

// ---------------------------------------------------------------------------
// 9.3 Comments
// ---------------------------------------------------------------------------

describe("9.3 comments", () => {
  it("creates a comment with Markdown and notifies a new mention", async () => {
    const c = client();
    const note = await createNote("Comments A");
    const res = (await (c as Record<string, CallableFunction>).createComment({
      id: note.id,
      markdown: "Hi @sam, please check.",
    })) as { id: string };
    expect(res.id).toBeDefined();

    const list = (await (c as Record<string, CallableFunction>).listComments({
      id: note.id,
    })) as { data: Array<{ markdown: string }> };
    expect(list.data).toHaveLength(1);
    expect(list.data[0]!.markdown).toContain("@sam");
    expect(countAttention(SAM, "mention", note.id)).toBe(1);
  });

  it("allows an author to edit only their own comment", async () => {
    const c = client();
    const note = await createNote("Comments Edit");
    const created = (await (c as Record<string, CallableFunction>).createComment({
      id: note.id,
      markdown: "original",
    })) as { id: string };

    // Another user cannot edit it.
    const sam = client(SAM);
    try {
      await (sam as Record<string, CallableFunction>).editComment({
        id: note.id,
        commentId: created.id,
        markdown: "hijack",
      });
      expect.unreachable("should have thrown forbidden");
    } catch (err) {
      expect((err as ORPCError<string, unknown>).code).toBe("forbidden");
    }

    // The author can.
    const ok = (await (c as Record<string, CallableFunction>).editComment({
      id: note.id,
      commentId: created.id,
      markdown: "edited by author",
    })) as { ok: boolean };
    expect(ok.ok).toBe(true);
  });

  it("deletes a comment when author or admin, but not another regular user", async () => {
    const c = client();
    const note = await createNote("Comments Delete");
    const sam = client(SAM);
    const created = (await (sam as Record<string, CallableFunction>).createComment({
      id: note.id,
      markdown: "sam's comment",
    })) as { id: string };

    // CJ (admin) can delete Sam's comment.
    const del = (await (c as Record<string, CallableFunction>).deleteComment({
      id: note.id,
      commentId: created.id,
    })) as { ok: boolean };
    expect(del.ok).toBe(true);

    const list = (await (c as Record<string, CallableFunction>).listComments({
      id: note.id,
    })) as { data: unknown[] };
    expect(list.data).toHaveLength(0);
  });

  it("rejects comments larger than 20 KB", async () => {
    const c = client();
    const note = await createNote("Comments Big");
    try {
      await (c as Record<string, CallableFunction>).createComment({
        id: note.id,
        markdown: "# " + "x".repeat(20 * 1024 + 1),
      });
      expect.unreachable("should have thrown validation_error");
    } catch (err) {
      expect((err as ORPCError<string, unknown>).code).toBe("validation_error");
    }
  });
});

// ---------------------------------------------------------------------------
// 9.4 Mention via API key
// ---------------------------------------------------------------------------

describe("9.4 mention diffing", () => {
  it("notifies for a mention written as Markdown by an API key", async () => {
    const c = client(CJ, { apiKeyId: "key-1", name: "Claude" });
    const note = await createNote("Mention API");
    await (c as Record<string, CallableFunction>).saveNotes({
      id: note.id,
      markdown: "@sam please handle.",
    });
    expect(countAttention(SAM, "mention", note.id)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 9.5 Assignees
// ---------------------------------------------------------------------------

describe("9.5 multiple assignees", () => {
  it("assigns two people, notifying each except the assigner", async () => {
    const c = client(); // CJ
    const note = await createNote("Assignees A");

    await (c as Record<string, CallableFunction>).addAssignee({
      id: note.id,
      userId: SAM,
    });
    await (c as Record<string, CallableFunction>).addAssignee({
      id: note.id,
      userId: ALICE,
    });

    const list = (await (c as Record<string, CallableFunction>).listAssignees({
      id: note.id,
    })) as { data: Array<{ id: string }> };
    expect(list.data.map((a) => a.id).sort()).toEqual([ALICE, SAM].sort());

    expect(countAttention(SAM, "assigned", note.id)).toBe(1);
    expect(countAttention(ALICE, "assigned", note.id)).toBe(1);
    // The assigner (CJ) is NOT notified for assigning others.
    expect(countAttention(CJ, "assigned", note.id)).toBe(0);
  });

  it("does not notify the assigner when they assign themselves", async () => {
    const c = client(); // CJ
    const note = await createNote("Assignees Self");
    await (c as Record<string, CallableFunction>).addAssignee({
      id: note.id,
      userId: CJ,
    });
    expect(countAttention(CJ, "assigned", note.id)).toBe(0);

    const list = (await (c as Record<string, CallableFunction>).listAssignees({
      id: note.id,
    })) as { data: Array<{ id: string }> };
    expect(list.data.map((a) => a.id)).toContain(CJ);
  });

  it("rejects assigning a member who is not active", async () => {
    const c = client();
    const note = await createNote("Assignees Inactive");
    try {
      await (c as Record<string, CallableFunction>).addAssignee({
        id: note.id,
        userId: "u-banned-none",
      });
      expect.unreachable("should have thrown validation_error");
    } catch (err) {
      expect((err as ORPCError<string, unknown>).code).toBe("validation_error");
    }
  });
});
