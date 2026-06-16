import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/db";
import { notifications, users } from "@/db/schema";
import { getNotificationHref } from "@/lib/notifications/routes";

export type NotificationRow = {
  id: string;
  type: string;
  summary: string;
  entityType: string | null;
  entityId: string | null;
  readAt: Date | null;
  createdAt: Date;
  href: string | null;
};

/** Cached per request — read before touchLastSeen in layout. */
export const getPreviousLastSeenAt = cache(async (userId: string): Promise<Date | null> => {
  const [row] = await getDb()
    .select({ lastSeenAt: users.lastSeenAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return row?.lastSeenAt ?? null;
});

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.recipientUserId, userId), isNull(notifications.readAt)));

  return row?.value ?? 0;
}

export async function listNotifications(userId: string, limit = 50): Promise<NotificationRow[]> {
  const rows = await getDb()
    .select()
    .from(notifications)
    .where(eq(notifications.recipientUserId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      type: row.type,
      summary: row.summary,
      entityType: row.entityType,
      entityId: row.entityId,
      readAt: row.readAt,
      createdAt: row.createdAt,
      href: await getNotificationHref(row.entityType, row.entityId),
    })),
  );
}

export async function listSinceLastVisit(
  userId: string,
  lastSeenAt: Date | null,
  limit = 3,
): Promise<NotificationRow[]> {
  if (!lastSeenAt) {
    return [];
  }

  const rows = await getDb()
    .select()
    .from(notifications)
    .where(and(eq(notifications.recipientUserId, userId), gt(notifications.createdAt, lastSeenAt)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      type: row.type,
      summary: row.summary,
      entityType: row.entityType,
      entityId: row.entityId,
      readAt: row.readAt,
      createdAt: row.createdAt,
      href: await getNotificationHref(row.entityType, row.entityId),
    })),
  );
}
