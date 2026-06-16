import { beforeEach, describe, expect, it, vi } from "vitest";
import { desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, resetDbForTests } from "@/db";
import { migrateTestDb } from "@/db/test-setup";
import { streamEntries } from "@/db/schema";
import { resetLuciaForTests } from "@/lib/auth/lucia";
import { createTestUser } from "@/lib/auth/test-helpers";
import { createEntry, markDone, togglePin, updateEntry } from "@/lib/actions/stream";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  requireUser: () => mockRequireUser(),
  displayName: (user: { displayName?: string | null; username: string }) =>
    user.displayName ?? user.username,
}));

const mockEmitHouseholdActivity = vi.fn();
const mockEmitMentions = vi.fn();
vi.mock("@/lib/notifications/emit", () => ({
  emitHouseholdActivity: (...args: unknown[]) => mockEmitHouseholdActivity(...args),
  emitMentions: (...args: unknown[]) => mockEmitMentions(...args),
}));

function resetTestDb(): void {
  resetDbForTests();
  resetLuciaForTests();
  process.env.DATABASE_URL = ":memory:";
  migrateTestDb();
  createStreamEntriesTable();
}

function createStreamEntriesTable(): void {
  const db = getDb();
  db.run(sql`
    CREATE TABLE IF NOT EXISTS stream_entries (
      id text PRIMARY KEY NOT NULL,
      body text NOT NULL,
      is_pinned integer NOT NULL DEFAULT 0,
      done_at integer,
      rough_when text,
      created_by_user_id text NOT NULL REFERENCES users(id),
      updated_by_user_id text NOT NULL REFERENCES users(id),
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    )
  `);
  db.run(
    sql`CREATE INDEX IF NOT EXISTS stream_entries_created_at_idx ON stream_entries (created_at)`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS stream_entries_pinned_created_at_idx ON stream_entries (is_pinned, created_at)`,
  );
  db.run(sql`CREATE INDEX IF NOT EXISTS stream_entries_done_at_idx ON stream_entries (done_at)`);
}

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.set(key, value);
  }
  return fd;
}

describe("stream actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTestDb();
  });

  it("creates an entry and emits household activity", async () => {
    const user = await createTestUser({ username: "alice", displayName: "Alice" });
    mockRequireUser.mockResolvedValue({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        disabledAt: null,
      },
      session: { id: "session-1" },
    });

    const result = await createEntry({}, formData({ body: "Buy milk", roughWhen: "this week" }));
    expect(result.error).toBeUndefined();

    const rows = await getDb().select().from(streamEntries);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.body).toBe("Buy milk");
    expect(rows[0]?.roughWhen).toBe("this week");
    expect(rows[0]?.createdByUserId).toBe(user.id);

    expect(mockEmitHouseholdActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "stream.created",
        actorId: user.id,
        entityType: "stream_entry",
        summary: "Alice added a stream note",
      }),
    );
    expect(mockEmitMentions).toHaveBeenCalled();
  });

  it("rejects empty body on create", async () => {
    const user = await createTestUser();
    mockRequireUser.mockResolvedValue({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        disabledAt: null,
      },
      session: { id: "session-1" },
    });

    const result = await createEntry({}, formData({ body: "   " }));
    expect(result.error).toMatch(/required/i);

    const rows = await getDb().select().from(streamEntries);
    expect(rows).toHaveLength(0);
  });

  it("updates an entry", async () => {
    const user = await createTestUser({ displayName: "Bob" });
    mockRequireUser.mockResolvedValue({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        disabledAt: null,
      },
      session: { id: "session-1" },
    });

    await createEntry({}, formData({ body: "Original" }));
    const [created] = await getDb().select().from(streamEntries);

    const result = await updateEntry(
      {},
      formData({ id: created!.id, body: "Updated note", roughWhen: "" }),
    );
    expect(result.error).toBeUndefined();

    const [updated] = await getDb()
      .select()
      .from(streamEntries)
      .where(eq(streamEntries.id, created!.id));
    expect(updated?.body).toBe("Updated note");
    expect(updated?.roughWhen).toBeNull();
    expect(mockEmitHouseholdActivity).toHaveBeenCalledWith(
      expect.objectContaining({ type: "stream.updated" }),
    );
  });

  it("toggles pin state", async () => {
    const user = await createTestUser();
    mockRequireUser.mockResolvedValue({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        disabledAt: null,
      },
      session: { id: "session-1" },
    });

    await createEntry({}, formData({ body: "Pin me" }));
    const [created] = await getDb().select().from(streamEntries);
    expect(created?.isPinned).toBe(false);

    await togglePin(formData({ id: created!.id }));
    const [pinned] = await getDb()
      .select()
      .from(streamEntries)
      .where(eq(streamEntries.id, created!.id));
    expect(pinned?.isPinned).toBe(true);

    await togglePin(formData({ id: created!.id }));
    const [unpinned] = await getDb()
      .select()
      .from(streamEntries)
      .where(eq(streamEntries.id, created!.id));
    expect(unpinned?.isPinned).toBe(false);
  });

  it("marks an entry done", async () => {
    const user = await createTestUser({ displayName: "Cara" });
    mockRequireUser.mockResolvedValue({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        disabledAt: null,
      },
      session: { id: "session-1" },
    });

    await createEntry({}, formData({ body: "Finish task" }));
    const [created] = await getDb().select().from(streamEntries);

    await markDone(formData({ id: created!.id }));
    const [done] = await getDb()
      .select()
      .from(streamEntries)
      .where(eq(streamEntries.id, created!.id));
    expect(done?.doneAt).toBeInstanceOf(Date);

    expect(mockEmitHouseholdActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "stream.done",
        summary: "Cara marked a stream note done",
      }),
    );
  });

  it("home query returns pinned and recent open entries", async () => {
    const user = await createTestUser();
    const now = Date.now();
    const db = getDb();

    await db.insert(streamEntries).values([
      {
        id: crypto.randomUUID(),
        body: "Old open",
        isPinned: false,
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(now - 3_000),
        updatedAt: new Date(now - 3_000),
      },
      {
        id: crypto.randomUUID(),
        body: "Pinned note",
        isPinned: true,
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(now - 2_000),
        updatedAt: new Date(now - 2_000),
      },
      {
        id: crypto.randomUUID(),
        body: "Recent open",
        isPinned: false,
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(now - 1_000),
        updatedAt: new Date(now - 1_000),
      },
      {
        id: crypto.randomUUID(),
        body: "Done note",
        isPinned: false,
        doneAt: new Date(now),
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      },
    ]);

    const rows = await db
      .select({ body: streamEntries.body, isPinned: streamEntries.isPinned })
      .from(streamEntries)
      .where(isNull(streamEntries.doneAt))
      .orderBy(desc(streamEntries.isPinned), desc(streamEntries.createdAt))
      .limit(5);

    expect(rows.map((r) => r.body)).toEqual(["Pinned note", "Recent open", "Old open"]);
    expect(rows[0]?.isPinned).toBe(true);
  });

  it("created entry appears in home-style open query", async () => {
    const user = await createTestUser();
    mockRequireUser.mockResolvedValue({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        disabledAt: null,
      },
      session: { id: "session-1" },
    });

    await createEntry({}, formData({ body: "Visible on home" }));

    const rows = await getDb()
      .select()
      .from(streamEntries)
      .where(isNull(streamEntries.doneAt))
      .orderBy(desc(streamEntries.createdAt))
      .limit(5);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.body).toBe("Visible on home");
  });
});
