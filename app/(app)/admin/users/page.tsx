import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { AdminUsersPanel } from "@/components/admin/AdminUsersPanel";

export default async function AdminUsersPage() {
  const allUsers = await getDb().select().from(users).orderBy(desc(users.createdAt));

  return (
    <AdminUsersPanel
      users={allUsers.map((user) => ({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        disabled: user.disabledAt !== null,
        lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
      }))}
    />
  );
}
