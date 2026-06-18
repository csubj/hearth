import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDbForTests } from "@/db";
import { notifications } from "@/db/schema";
import { migrateTestDb } from "@/db/test-setup";
import { resetLuciaForTests } from "@/lib/auth/lucia";
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

import { markAllRead } from "@/lib/actions/notifications";

function resetTestDb(): void {
  resetDbForTests();
  resetLuciaForTests();
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
});
