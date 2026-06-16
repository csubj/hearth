import { isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import type { MentionUser } from "@/components/MentionTextarea";

export async function loadMentionUsers(): Promise<MentionUser[]> {
  const rows = await getDb()
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
    })
    .from(users)
    .where(isNull(users.disabledAt));

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.displayName,
  }));
}
