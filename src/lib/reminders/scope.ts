import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";

export { isReminderVisibleToUser } from "@/lib/reminders/interval";

export async function resolveReminderRecipientIds(
  recipientUserId: string | null,
): Promise<string[]> {
  if (recipientUserId) {
    const [target] = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, recipientUserId), isNull(users.disabledAt)))
      .limit(1);

    return target ? [target.id] : [];
  }

  const rows = await getDb().select({ id: users.id }).from(users).where(isNull(users.disabledAt));

  return rows.map((row) => row.id);
}
