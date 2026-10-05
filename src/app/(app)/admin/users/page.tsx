import { serverClient } from "@/lib/orpc-server-client";
import { AdminUsersClient } from "./admin-users-client";

/**
 * Admin users management page (task 5.1).
 *
 * Server Component that loads the user list, then hands off to a Client
 * Component for interactive forms and mutations.
 */
export default async function AdminUsersPage() {
  let users: Array<{
    id: string;
    username: string | null;
    name: string;
    email: string;
    role: string | null;
    banned: boolean | null;
    banReason: string | null;
    createdAt: Date;
  }> = [];
  let loadError: string | null = null;

  try {
    const result = await serverClient.adminListUsers({});
    users = result.users;
  } catch {
    loadError = "Failed to load users. You may not have admin access.";
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Manage Users</h1>
      {loadError ? (
        <p className="text-destructive">{loadError}</p>
      ) : (
        <AdminUsersClient initialUsers={users} />
      )}
    </div>
  );
}
