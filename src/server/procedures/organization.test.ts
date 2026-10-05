/**
 * Tests for organization shared services (tasks 8.1–8.4, design D8/D15).
 *
 *  - Tags: case-insensitive dedup, inline creation, shared across modules,
 *    set-delta activity, and a `tag` list filter.
 *  - Links: relation labels both directions, symmetric `related`, duplicate
 *    conflict, and hiding links to trashed entities.
 *  - URLs: add/list/remove.
 *  - Attachments: sniffed type, spoof rejection, 24 MB PDF round-trip,
 *    401 on unauthenticated GET, 403 on a disabled feature, and no file left
 *    behind on a failed transaction.
 */

import "server-only";
import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "file::memory:?cache=shared";
});

import { randomUUID } from "node:crypto";
import { createRouterClient, ORPCError } from "@orpc/server";
import { rmSync, mkdirSync, readdirSync, existsSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { validationInterceptor } from "../orpc";
import type { AppContext } from "../context";
import { router } from "../router";
import { db, sqlite } from "../../db";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { MIGRATIONS_FOLDER } from "../../db/testing";
import {
  uploadAttachment,
  readAttachment,
  sweepAttachments,
  uploadsDir,
  uploadsTmpDir,
} from "../attachments";
import { GET as serveAttachmentGet } from "../../app/api/attachments/[id]/route";
import type { WriteContext } from "../write";

// ---------------------------------------------------------------------------
// Global setup — in-memory DB + migrations
// ---------------------------------------------------------------------------

const PREFIX = randomUUID().slice(0, 8);
const USER_ID = `u-org-${PREFIX}`;
const UPLOADS_DIR = join(tmpdir(), `hearth-uploads-${PREFIX}`);

beforeAll(() => {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO user
       (id, name, email, email_verified, created_at, updated_at, username, role)
       VALUES (?, ?, ?, 0, unixepoch()*1000, unixepoch()*1000, ?, ?)`,
    )
    .run(USER_ID, "orgtest", `orgtest-${PREFIX}@users.hearth.invalid`, `orgtest-${PREFIX}`, "user");

  process.env.UPLOADS_DIR = UPLOADS_DIR;
  mkdirSync(UPLOADS_DIR, { recursive: true });
});

afterAll(() => {
  rmSync(UPLOADS_DIR, { recursive: true, force: true });
});

function ctx(): AppContext {
  return {
    user: {
      id: USER_ID,
      name: "orgtest",
      email: `orgtest-${PREFIX}@users.hearth.invalid`,
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

function client() {
  return createRouterClient(router, {
    context: ctx(),
    interceptors: [validationInterceptor],
  });
}

interface Note {
  id: string;
  title: string;
  type?: string;
}

async function createNote(title: string): Promise<Note> {
  const c = client();
  const result = (await (c as Record<string, CallableFunction>).notesPageCreate({
    title,
  })) as Note;
  return result;
}

// ---------------------------------------------------------------------------
// 8.1 Tags
// ---------------------------------------------------------------------------

describe("8.1 tags", () => {
  it("creates tags with case-insensitive dedup and inline creation", async () => {
    const c = client();
    const a = await createNote("Tag A");
    const b = await createNote("Tag B");

    // Tag a's note "kitchen", then b's note "Kitchen" → same tag.
    await (c as Record<string, CallableFunction>).tagsAdd({ id: a.id, name: "kitchen" });
    const bResult = (await (c as Record<string, CallableFunction>).tagsAdd({
      id: b.id,
      name: "Kitchen",
    })) as { tagId: string; name: string; created: boolean };
    expect(bResult.created).toBe(false); // reused existing tag
    expect(bResult.name).toBe("kitchen"); // stored original case

    // Both entities share the tag.
    const aTags = (await (c as Record<string, CallableFunction>).tagsList({ id: a.id }))
      .data as Array<{ id: string; name: string }>;
    const bTags = (await (c as Record<string, CallableFunction>).tagsList({ id: b.id }))
      .data as Array<{ id: string; name: string }>;
    expect(aTags).toHaveLength(1);
    expect(bTags).toHaveLength(1);
    expect(aTags[0]!.name).toBe("kitchen");
    expect(bTags[0]!.id).toBe(aTags[0]!.id);
  });

  it("records a set delta in activity", async () => {
    const c = client();
    const note = await createNote("Set delta note");
    await (c as Record<string, CallableFunction>).tagsAdd({ id: note.id, name: "alpha" });

    const activity = sqlite
      .prepare(
        "SELECT action, diff FROM activity WHERE entity_id = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(note.id) as { action: string; diff: string };
    expect(activity).toBeDefined();
    const parsed = JSON.parse(activity.diff) as { sets?: Record<string, unknown> };
    expect(parsed.sets).toBeDefined();
  });

  it("supports tag removal", async () => {
    const c = client();
    const note = await createNote("Remove tag");
    const res = (await (c as Record<string, CallableFunction>).tagsAdd({
      id: note.id,
      name: "temp",
    })) as { tagId: string };
    await (c as Record<string, CallableFunction>).tagsRemove({
      id: note.id,
      tagId: res.tagId,
    });
    const tags = (await (c as Record<string, CallableFunction>).tagsList({ id: note.id }))
      .data as unknown[];
    expect(tags).toHaveLength(0);
  });

  it("filters a module list by tag", async () => {
    const c = client();
    const note = await createNote("Filter by tag");
    await (c as Record<string, CallableFunction>).tagsAdd({ id: note.id, name: "filterme" });

    const result = (await (c as Record<string, CallableFunction>).notesPageList({
      filters: { tag: "FILTERME" },
    })) as { data: Array<{ id: string }> };
    const ids = result.data.map((e) => e.id);
    expect(ids).toContain(note.id);

    const none = (await (c as Record<string, CallableFunction>).notesPageList({
      filters: { tag: "does-not-exist" },
    })) as { data: Array<{ id: string }> };
    expect(none.data).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 8.2 Entity links
// ---------------------------------------------------------------------------

describe("8.2 entity links", () => {
  it("shows direction-appropriate labels and symmetric related", async () => {
    const c = client();
    const item = await createNote("Item");
    const record = await createNote("Record");

    // record fixes item
    await (c as Record<string, CallableFunction>).linksAdd({
      id: record.id,
      toId: item.id,
      relation: "fixes",
    });

    const recordLinks = (await (c as Record<string, CallableFunction>).linksList({ id: record.id }))
      .data as Array<{ label: string; direction: string; otherTitle: string }>;
    const itemLinks = (await (c as Record<string, CallableFunction>).linksList({ id: item.id }))
      .data as Array<{ label: string; direction: string; otherTitle: string }>;

    const out = recordLinks.find((l) => l.direction === "out")!;
    const inLink = itemLinks.find((l) => l.direction === "in")!;
    expect(out.label).toBe("fixes Item");
    expect(inLink.label).toBe("fixed by Record");
  });

  it("enforces duplicate + symmetric-related conflict", async () => {
    const c = client();
    const a = await createNote("Link A");
    const b = await createNote("Link B");

    const first = (await (c as Record<string, CallableFunction>).linksAdd({
      id: a.id,
      toId: b.id,
      relation: "related",
    })) as { id: string };
    expect(first.id).toBeDefined();

    // A related B, then B related A → conflict (symmetric dup).
    try {
      await (c as Record<string, CallableFunction>).linksAdd({
        id: b.id,
        toId: a.id,
        relation: "related",
      });
      expect.unreachable("should have thrown conflict");
    } catch (err) {
      expect((err as ORPCError<string, unknown>).code).toBe("conflict");
    }

    // Same literal pair + relation → conflict.
    try {
      await (c as Record<string, CallableFunction>).linksAdd({
        id: a.id,
        toId: b.id,
        relation: "related",
      });
      expect.unreachable("should have thrown conflict");
    } catch (err) {
      expect((err as ORPCError<string, unknown>).code).toBe("conflict");
    }
  });

  it("hides links to trashed entities", async () => {
    const c = client();
    const a = await createNote("Hide A");
    const b = await createNote("Hide B");

    await (c as Record<string, CallableFunction>).linksAdd({
      id: a.id,
      toId: b.id,
      relation: "uses",
    });

    // Trash b.
    await (c as Record<string, CallableFunction>).notesPageDelete({ id: b.id });

    const aLinks = (await (c as Record<string, CallableFunction>).linksList({ id: a.id }))
      .data as unknown[];
    expect(aLinks).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 8.3 External URLs
// ---------------------------------------------------------------------------

describe("8.3 external URLs", () => {
  it("adds and lists labeled URLs", async () => {
    const c = client();
    const note = await createNote("URL note");
    const res = (await (c as Record<string, CallableFunction>).urlsAdd({
      id: note.id,
      label: "Docs",
      url: "https://example.com/docs",
    })) as { id: string };
    expect(res.id).toBeDefined();

    const urls = (await (c as Record<string, CallableFunction>).urlsList({ id: note.id }))
      .data as Array<{ label: string; url: string }>;
    expect(urls).toHaveLength(1);
    expect(urls[0]!.label).toBe("Docs");
    expect(urls[0]!.url).toBe("https://example.com/docs");
  });

  it("rejects a labeled URL that is not http(s)", async () => {
    const c = client();
    const note = await createNote("Bad URL note");
    try {
      await (c as Record<string, CallableFunction>).urlsAdd({
        id: note.id,
        label: "Bad",
        url: "ftp://example.com",
      });
      expect.unreachable("should have thrown validation_error");
    } catch (err) {
      expect((err as ORPCError<string, unknown>).code).toBe("validation_error");
    }
  });
});

// ---------------------------------------------------------------------------
// 8.4 Attachments
// ---------------------------------------------------------------------------

function pngBuffer(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(32, 0x00),
  ]);
}

function pdfBuffer(sizeMB: number): Buffer {
  const buf = Buffer.alloc(sizeMB * 1024 * 1024);
  Buffer.from("%PDF-1.7").copy(buf, 0);
  return buf;
}

function writeCtx(userId = USER_ID): WriteContext {
  return {
    user: { id: userId, role: "user" },
    via: "web",
    now: Date.now(),
    requestId: randomUUID(),
  };
}

describe("8.4 attachments", () => {
  it("accepts an image and sniffs its type from content", async () => {
    const note = await createNote("Upload image");
    const bytes = pngBuffer();
    const result = await uploadAttachment(writeCtx(), note.id, {
      name: "photo.png",
      bytes,
    });
    expect(result.mime).toBe("image/png");
    expect(result.size).toBe(bytes.length);

    const served = readAttachment(result.id);
    expect(served.mime).toBe("image/png");
    expect(Buffer.compare(served.bytes, bytes)).toBe(0);
  });

  it("rejects a spoofed file named .jpg containing non-image bytes", async () => {
    const note = await createNote("Spoof upload");
    const beforeUploads = new Set(readdirSafe(uploadsDir()));
    const beforeTmp = new Set(readdirSafe(uploadsTmpDir()));
    const spoof = Buffer.from("This is definitely not an image");
    await expect(
      uploadAttachment(writeCtx(), note.id, { name: "photo.jpg", bytes: spoof }),
    ).rejects.toMatchObject({ code: "validation_error" });

    // No file or record left behind.
    const afterUploads = new Set(readdirSafe(uploadsDir()));
    const afterTmp = new Set(readdirSafe(uploadsTmpDir()));
    for (const f of afterUploads) expect(beforeUploads.has(f)).toBe(true);
    for (const f of afterTmp) expect(beforeTmp.has(f)).toBe(true);
    const list = (await client().attachmentsList({ id: note.id })) as {
      data: unknown[];
    };
    expect(list.data).toHaveLength(0);
  });

  it("round-trips a 24 MB PDF byte-identical", async () => {
    const note = await createNote("PDF upload");
    const bytes = pdfBuffer(24);
    const result = await uploadAttachment(writeCtx(), note.id, {
      name: "manual.pdf",
      bytes,
    });
    expect(result.mime).toBe("application/pdf");

    const served = readAttachment(result.id);
    expect(served.bytes.length).toBe(bytes.length);
    expect(Buffer.compare(served.bytes, bytes)).toBe(0);
  });

  it("returns 401 for an unauthenticated GET", async () => {
    const note = await createNote("Private attachment");
    const bytes = pngBuffer();
    const result = await uploadAttachment(writeCtx(), note.id, {
      name: "private.png",
      bytes,
    });

    const res = await serveAttachmentGet(
      new Request("http://localhost/api/attachments/" + result.id),
      { params: Promise.resolve({ id: result.id }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for a disabled feature", async () => {
    // A place module does not enable attachments.
    const place = (await client().placesCreate({
      title: "Property",
      kind: "property",
    })) as { id: string };

    const bytes = pngBuffer();
    await expect(
      uploadAttachment(writeCtx(), place.id, { name: "x.png", bytes }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("leaves no file when the transaction fails", async () => {
    const note = await createNote("Failed tx");
    const bytes = pngBuffer();
    const beforeUploads = new Set(readdirSafe(uploadsDir()));
    const beforeTmp = new Set(readdirSafe(uploadsTmpDir()));

    // Craft a context whose user id is not a real user → FK violation inside
    // the transaction after the temp file is written, so the cleanup must run.
    await expect(
      uploadAttachment(writeCtx("no-such-user"), note.id, {
        name: "fail.png",
        bytes,
      }),
    ).rejects.toBeDefined();

    const afterUploads = new Set(readdirSafe(uploadsDir()));
    const afterTmp = new Set(readdirSafe(uploadsTmpDir()));
    for (const f of afterUploads) expect(beforeUploads.has(f)).toBe(true);
    for (const f of afterTmp) expect(beforeTmp.has(f)).toBe(true);
  });

  it("sweeps temp files older than one hour", () => {
    const tmpDir = uploadsTmpDir();
    mkdirSync(tmpDir, { recursive: true });
    const old = join(tmpDir, "old-temp");
    const fresh = join(tmpDir, "fresh-temp");
    writeFileSync(old, "x");
    writeFileSync(fresh, "x");
    const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(old, oldTime, oldTime);

    const conn = (db as unknown as { $client: import("better-sqlite3").Database })
      .$client;
    sweepAttachments(conn, Date.now());

    expect(existsSync(old)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
  });
});

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
