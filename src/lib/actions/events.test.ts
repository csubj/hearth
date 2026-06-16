import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDbForTests } from "@/db";
import { events } from "@/db/schema";
import { migrateTestDb } from "@/db/test-setup";
import { resetLuciaForTests } from "@/lib/auth/lucia";
import { createTestUser } from "@/lib/auth/test-helpers";
import {
  createEvent,
  deleteEvent,
  listHomeEvents,
  listPastEvents,
  listUpcomingEvents,
  updateEvent,
} from "@/lib/actions/events";
import { emitHouseholdActivity, emitMentions } from "@/lib/notifications/emit";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(),
  displayName: (user: { displayName: string | null; username: string }) =>
    user.displayName ?? user.username,
}));

vi.mock("@/lib/notifications/emit", () => ({
  emitHouseholdActivity: vi.fn(),
  emitMentions: vi.fn(),
}));

import { requireUser } from "@/lib/auth/session";

function resetTestDb(): void {
  resetDbForTests();
  resetLuciaForTests();
  process.env.DATABASE_URL = ":memory:";
  migrateTestDb();
  ensureEventsTable();
}

function ensureEventsTable(): void {
  const db = getDb();
  db.run(sql`
    CREATE TABLE IF NOT EXISTS events (
      id text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      starts_at integer NOT NULL,
      location text,
      link text,
      note text,
      created_by_user_id text NOT NULL,
      updated_by_user_id text NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id),
      FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
    )
  `);
  db.run(sql`CREATE INDEX IF NOT EXISTS events_starts_at_idx ON events (starts_at)`);
}

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.set(key, value);
  }
  return fd;
}

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function insertEvent(
  userId: string,
  overrides: Partial<{
    title: string;
    startsAt: Date;
    location: string | null;
    link: string | null;
    note: string | null;
  }> = {},
) {
  const now = new Date();
  const row = {
    id: crypto.randomUUID(),
    title: overrides.title ?? "Sample event",
    startsAt: overrides.startsAt ?? new Date(now.getTime() + 24 * 60 * 60 * 1000),
    location: overrides.location ?? null,
    link: overrides.link ?? null,
    note: overrides.note ?? null,
    createdByUserId: userId,
    updatedByUserId: userId,
    createdAt: now,
    updatedAt: now,
  };
  await getDb().insert(events).values(row);
  return row;
}

describe("event actions", () => {
  beforeEach(() => {
    resetTestDb();
    vi.clearAllMocks();
  });

  it("creates an event with attribution", async () => {
    const user = await createTestUser();
    vi.mocked(requireUser).mockResolvedValue({
      user: { ...user, disabledAt: user.disabledAt ?? null },
      session: { id: "sess", userId: user.id, expiresAt: new Date(), fresh: true },
    });

    const startsAt = new Date("2026-07-04T18:00:00");
    const result = await createEvent(
      {},
      formData({
        title: "Block party",
        startsAt: toLocalInput(startsAt),
        location: "Main St",
        link: "https://example.com/party",
        note: "Bring chairs",
      }),
    );

    expect(result.error).toBeUndefined();
    expect(result.success).toBe("Event added");

    const rows = await getDb().select().from(events);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("Block party");
    expect(rows[0]!.startsAt.getTime()).toBe(startsAt.getTime());
    expect(rows[0]!.createdByUserId).toBe(user.id);
    expect(rows[0]!.updatedByUserId).toBe(user.id);

    expect(emitHouseholdActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "event.created",
        summary: expect.stringContaining('added event "Block party"'),
      }),
    );
  });

  it("rejects missing title", async () => {
    const user = await createTestUser();
    vi.mocked(requireUser).mockResolvedValue({
      user: { ...user, disabledAt: user.disabledAt ?? null },
      session: { id: "sess", userId: user.id, expiresAt: new Date(), fresh: true },
    });

    const result = await createEvent(
      {},
      formData({
        title: "",
        startsAt: toLocalInput(new Date("2026-07-04T18:00:00")),
      }),
    );

    expect(result.error).toBe("Title is required");
    expect(await getDb().select().from(events)).toHaveLength(0);
  });

  it("creates an event with actor name in summary", async () => {
    const user = await createTestUser({ displayName: "Alice" });
    vi.mocked(requireUser).mockResolvedValue({
      user: { ...user, disabledAt: user.disabledAt ?? null },
      session: { id: "sess", userId: user.id, expiresAt: new Date(), fresh: true },
    });

    await createEvent(
      {},
      formData({
        title: "Picnic",
        startsAt: toLocalInput(new Date("2026-07-04T18:00:00")),
      }),
    );

    expect(emitHouseholdActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: 'Alice added event "Picnic"',
      }),
    );
  });

  it("updates an existing event", async () => {
    const user = await createTestUser();
    vi.mocked(requireUser).mockResolvedValue({
      user: { ...user, disabledAt: user.disabledAt ?? null },
      session: { id: "sess", userId: user.id, expiresAt: new Date(), fresh: true },
    });

    const event = await insertEvent(user.id, { title: "Vet visit" });
    const newStart = new Date("2026-08-01T15:00:00");

    const result = await updateEvent(
      {},
      formData({
        eventId: event.id,
        title: "Vet checkup",
        startsAt: toLocalInput(newStart),
        location: "Clinic",
        link: "",
        note: "",
      }),
    );

    expect(result.success).toBe("Event updated");

    const [row] = await getDb().select().from(events).where(eq(events.id, event.id));
    expect(row!.title).toBe("Vet checkup");
    expect(row!.startsAt.getTime()).toBe(newStart.getTime());
    expect(row!.location).toBe("Clinic");
    expect(row!.updatedByUserId).toBe(user.id);

    expect(emitHouseholdActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "event.updated",
        summary: `${user.username} updated event "Vet checkup"`,
      }),
    );
    expect(emitMentions).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "",
        entityType: "event",
        entityId: event.id,
      }),
    );
  });

  it("rejects invalid event id on update", async () => {
    const user = await createTestUser();
    vi.mocked(requireUser).mockResolvedValue({
      user: { ...user, disabledAt: user.disabledAt ?? null },
      session: { id: "sess", userId: user.id, expiresAt: new Date(), fresh: true },
    });

    const result = await updateEvent(
      {},
      formData({
        eventId: "not-a-uuid",
        title: "Bad",
        startsAt: toLocalInput(new Date("2026-07-04T18:00:00")),
      }),
    );

    expect(result.error).toBe("Invalid event");
  });

  it("deletes an event", async () => {
    const user = await createTestUser();
    vi.mocked(requireUser).mockResolvedValue({
      user: { ...user, disabledAt: user.disabledAt ?? null },
      session: { id: "sess", userId: user.id, expiresAt: new Date(), fresh: true },
    });

    const event = await insertEvent(user.id);
    const result = await deleteEvent({}, formData({ eventId: event.id }));

    expect(result.success).toBe("Event deleted");
    expect(await getDb().select().from(events)).toHaveLength(0);
  });

  it("rejects invalid event id on delete", async () => {
    const user = await createTestUser();
    vi.mocked(requireUser).mockResolvedValue({
      user: { ...user, disabledAt: user.disabledAt ?? null },
      session: { id: "sess", userId: user.id, expiresAt: new Date(), fresh: true },
    });

    const result = await deleteEvent({}, formData({ eventId: "bad-id" }));
    expect(result.error).toBe("Invalid event");
  });
});

describe("event queries", () => {
  beforeEach(() => {
    resetTestDb();
    vi.clearAllMocks();
  });

  it("requires authentication for list helpers", async () => {
    vi.mocked(requireUser).mockImplementation(() => {
      throw new Error("REDIRECT:/login");
    });

    await expect(listUpcomingEvents()).rejects.toThrow("REDIRECT:/login");
    await expect(listPastEvents()).rejects.toThrow("REDIRECT:/login");
    await expect(listHomeEvents()).rejects.toThrow("REDIRECT:/login");
  });

  it("lists upcoming events sorted ascending by starts_at", async () => {
    const user = await createTestUser();
    vi.mocked(requireUser).mockResolvedValue({
      user: { ...user, disabledAt: user.disabledAt ?? null },
      session: { id: "sess", userId: user.id, expiresAt: new Date(), fresh: true },
    });
    const now = Date.now();
    await insertEvent(user.id, {
      title: "Later",
      startsAt: new Date(now + 3 * 24 * 60 * 60 * 1000),
    });
    await insertEvent(user.id, {
      title: "Sooner",
      startsAt: new Date(now + 1 * 24 * 60 * 60 * 1000),
    });
    await insertEvent(user.id, {
      title: "Past",
      startsAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
    });

    const upcoming = await listUpcomingEvents(now);
    expect(upcoming.map((e) => e.title)).toEqual(["Sooner", "Later"]);
  });

  it("lists past events sorted descending by starts_at", async () => {
    const user = await createTestUser();
    vi.mocked(requireUser).mockResolvedValue({
      user: { ...user, disabledAt: user.disabledAt ?? null },
      session: { id: "sess", userId: user.id, expiresAt: new Date(), fresh: true },
    });
    const now = Date.now();
    await insertEvent(user.id, {
      title: "Older",
      startsAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
    });
    await insertEvent(user.id, {
      title: "Recent past",
      startsAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
    });
    await insertEvent(user.id, {
      title: "Future",
      startsAt: new Date(now + 1 * 24 * 60 * 60 * 1000),
    });

    const past = await listPastEvents(now);
    expect(past.map((e) => e.title)).toEqual(["Recent past", "Older"]);
  });

  it("lists home events within 14 days, limited to 5", async () => {
    const user = await createTestUser();
    vi.mocked(requireUser).mockResolvedValue({
      user: { ...user, disabledAt: user.disabledAt ?? null },
      session: { id: "sess", userId: user.id, expiresAt: new Date(), fresh: true },
    });
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    for (let i = 1; i <= 6; i += 1) {
      await insertEvent(user.id, {
        title: `Day ${i}`,
        startsAt: new Date(now + i * day),
      });
    }
    await insertEvent(user.id, {
      title: "Too far",
      startsAt: new Date(now + 20 * day),
    });
    await insertEvent(user.id, {
      title: "Already past",
      startsAt: new Date(now - day),
    });

    const home = await listHomeEvents(now);
    expect(home).toHaveLength(5);
    expect(home.map((e) => e.title)).toEqual(["Day 1", "Day 2", "Day 3", "Day 4", "Day 5"]);
  });
});
