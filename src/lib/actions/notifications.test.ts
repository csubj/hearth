import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDbForTests } from "@/db";
import { notifications } from "@/db/schema";
import { migrateTestDb } from "@/db/test-setup";
import { resetSessionStoreForTests } from "@/lib/auth/session-store";
import { createTestUser } from "@/lib/auth/test-helpers";
import { getUnreadNotificationCount } from "@/lib/notifications/queries";

const mockRequireUser = vi.fn();
const mockRevalidatePath = vi.fn();
const mockRedirect = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireUser: () => mockRequireUser(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { clearReadNotifications, deleteNotification, markAllRead } from "@/lib/actions/notifications";

function resetTestDb(): void {
  resetDbForTests();
  resetSessionStoreForTests();
  process.env.DATABASE_URL = ":memory:";
  migrateTestDb();
}

describe("notification actions", () => {
  beforeEach(async () => {
    resetTestDb();
    vi.clearAllMocks();
  });

  it("markAllRead clears unread badge count", async () => {
    const user = await createTestUser({ username: "me" });
    const other = await createTestUser({ username: "other" });
    mockRequireUser.mockResolvedValue({ user: { id: user.id } });

    const now = new Date();
    await getDb()
      .insert(notifications)
      .values([
        {
          id: crypto.randomUUID(),
          recipientUserId: user.id,
          actorUserId: other.id,
          type: "project.created",
          entityType: "project",
          entityId: crypto.randomUUID(),
          summary: "Other added a note",
          readAt: null,
          createdAt: now,
        },
        {
          id: crypto.randomUUID(),
          recipientUserId: user.id,
          actorUserId: other.id,
          type: "mention",
          entityType: "project",
          entityId: crypto.randomUUID(),
          summary: "Other mentioned you",
          readAt: now,
          createdAt: now,
        },
      ]);

    expect(await getUnreadNotificationCount(user.id)).toBe(1);

    await markAllRead();

    expect(await getUnreadNotificationCount(user.id)).toBe(0);

    const unreadRows = await getDb()
      .select()
      .from(notifications)
      .where(and(eq(notifications.recipientUserId, user.id), isNull(notifications.readAt)));
    expect(unreadRows).toHaveLength(0);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/notifications");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });

  it("deleteNotification removes only the recipient's notification", async () => {
    const user = await createTestUser({ username: "me" });
    const other = await createTestUser({ username: "other" });
    mockRequireUser.mockResolvedValue({ user: { id: user.id } });

    const now = new Date();
    const mine = {
      id: crypto.randomUUID(),
      recipientUserId: user.id,
      actorUserId: other.id,
      type: "project.created",
      summary: "Mine",
      readAt: null,
      createdAt: now,
    };
    const theirs = {
      id: crypto.randomUUID(),
      recipientUserId: other.id,
      actorUserId: user.id,
      type: "project.created",
      summary: "Theirs",
      readAt: null,
      createdAt: now,
    };
    await getDb().insert(notifications).values([mine, theirs]);

    const fd = new FormData();
    fd.append("id", mine.id);
    await deleteNotification(fd);

    const remaining = await getDb().select().from(notifications);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(theirs.id);
  });

  it("deleteNotification is a no-op for another user's id", async () => {
    const user = await createTestUser({ username: "me" });
    const other = await createTestUser({ username: "other" });
    mockRequireUser.mockResolvedValue({ user: { id: user.id } });

    const now = new Date();
    const theirs = {
      id: crypto.randomUUID(),
      recipientUserId: other.id,
      actorUserId: user.id,
      type: "mention",
      summary: "Theirs",
      readAt: null,
      createdAt: now,
    };
    await getDb().insert(notifications).values(theirs);

    const fd = new FormData();
    fd.append("id", theirs.id);
    await deleteNotification(fd);

    const remaining = await getDb().select().from(notifications);
    expect(remaining).toHaveLength(1);
  });

  it("clearReadNotifications removes only read notifications", async () => {
    const user = await createTestUser({ username: "me" });
    const other = await createTestUser({ username: "other" });
    mockRequireUser.mockResolvedValue({ user: { id: user.id } });

    const now = new Date();
    const read = {
      id: crypto.randomUUID(),
      recipientUserId: user.id,
      actorUserId: other.id,
      type: "mention",
      summary: "Read",
      readAt: now,
      createdAt: now,
    };
    const unread = {
      id: crypto.randomUUID(),
      recipientUserId: user.id,
      actorUserId: other.id,
      type: "project.created",
      summary: "Unread",
      readAt: null,
      createdAt: now,
    };
    const theirsUnread = {
      id: crypto.randomUUID(),
      recipientUserId: other.id,
      actorUserId: user.id,
      type: "mention",
      summary: "Theirs",
      readAt: null,
      createdAt: now,
    };
    await getDb().insert(notifications).values([read, unread, theirsUnread]);

    await clearReadNotifications();

    const remaining = await getDb().select().from(notifications);
    expect(remaining).toHaveLength(2);
    expect(remaining.map((r) => r.id).sort()).toEqual([theirsUnread.id, unread.id].sort());
  });
});
