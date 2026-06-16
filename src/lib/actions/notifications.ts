"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { getNotificationHref } from "@/lib/notifications/routes";

const idSchema = z.object({
  id: z.string().uuid(),
});

function revalidateNotificationPaths(): void {
  revalidatePath("/notifications");
  revalidatePath("/");
}

export async function markRead(formData: FormData): Promise<void> {
  const { user } = await requireUser();

  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return;
  }

  const now = new Date();
  await getDb()
    .update(notifications)
    .set({ readAt: now })
    .where(and(eq(notifications.id, parsed.data.id), eq(notifications.recipientUserId, user.id)));

  revalidateNotificationPaths();

  const href = formData.get("href");
  if (typeof href === "string" && href.startsWith("/")) {
    redirect(href);
  }
}

export async function markAllRead(): Promise<void> {
  const { user } = await requireUser();
  const now = new Date();

  await getDb()
    .update(notifications)
    .set({ readAt: now })
    .where(and(eq(notifications.recipientUserId, user.id), isNull(notifications.readAt)));

  revalidateNotificationPaths();
}

export async function openNotification(notificationId: string): Promise<void> {
  const { user } = await requireUser();

  const [row] = await getDb()
    .select()
    .from(notifications)
    .where(and(eq(notifications.id, notificationId), eq(notifications.recipientUserId, user.id)))
    .limit(1);

  if (!row) {
    redirect("/notifications");
  }

  if (!row.readAt) {
    await getDb()
      .update(notifications)
      .set({ readAt: new Date() })
      .where(eq(notifications.id, notificationId));
  }

  revalidateNotificationPaths();

  const href = await getNotificationHref(row.entityType, row.entityId);
  redirect(href ?? "/notifications");
}
