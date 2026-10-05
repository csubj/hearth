"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { invoke } from "@/lib/actions/invoke";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserRow {
  id: string;
  username: string | null;
  name: string;
  email: string;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminUsersClient({
  initialUsers,
}: {
  initialUsers: UserRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create user form state
  const [newUsername, setNewUsername] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");

  // Reset password dialog state
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  function clearMessages() {
    setError(null);
    setSuccess(null);
  }

  function refreshAndReport(msg: string) {
    setSuccess(msg);
    setError(null);
    startTransition(() => {
      router.refresh();
    });
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    clearMessages();
    const [err] = await invoke("adminCreateUser", {
      username: newUsername,
      password: newPassword,
      name: newName,
      role: newRole,
    });
    if (err) {
      setError(err.message);
      return;
    }
    setNewUsername("");
    setNewName("");
    setNewPassword("");
    setNewRole("user");
    refreshAndReport(`User "${newUsername}" created.`);
  }

  async function handleDisable(userId: string) {
    clearMessages();
    const [err] = await invoke("adminDisableUser", { id: userId });
    if (err) {
      setError(err.message);
      return;
    }
    refreshAndReport("User disabled.");
  }

  async function handleEnable(userId: string) {
    clearMessages();
    const [err] = await invoke("adminEnableUser", { id: userId });
    if (err) {
      setError(err.message);
      return;
    }
    refreshAndReport("User enabled.");
  }

  async function handleSetRole(userId: string, role: "admin" | "user") {
    clearMessages();
    const [err] = await invoke("adminSetUserRole", { id: userId, role });
    if (err) {
      setError(err.message);
      return;
    }
    refreshAndReport(`Role updated to ${role}.`);
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetUserId) return;
    clearMessages();
    const [err] = await invoke("adminResetPassword", {
      id: resetUserId,
      newPassword: resetPassword,
    });
    if (err) {
      setError(err.message);
      return;
    }
    setResetUserId(null);
    setResetPassword("");
    refreshAndReport("Password reset.");
  }

  const inputClasses =
    "w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";

  return (
    <div className="space-y-8">
      {/* Messages */}
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
          {success}
        </p>
      )}

      {/* Create user form */}
      <section className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-medium">Create User</h2>
        <form onSubmit={handleCreateUser} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="new-username" className="text-sm font-medium">
              Username
            </label>
            <input
              id="new-username"
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className={inputClasses}
              required
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="new-name" className="text-sm font-medium">
              Display Name
            </label>
            <input
              id="new-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className={inputClasses}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="new-password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClasses}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="new-role" className="text-sm font-medium">
              Role
            </label>
            <select
              id="new-role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as "user" | "admin")}
              className={inputClasses}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={isPending}>
              Create User
            </Button>
          </div>
        </form>
      </section>

      {/* Users table */}
      <section className="rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Username</th>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {initialUsers.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">
                    {u.username ?? "—"}
                  </td>
                  <td className="px-4 py-3">{u.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        u.role === "admin"
                          ? "rounded bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
                          : "rounded bg-muted px-2 py-0.5 text-xs font-medium"
                      }
                    >
                      {u.role ?? "user"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.banned ? (
                      <span className="text-destructive text-xs font-medium">
                        Disabled
                        {u.banReason ? ` — ${u.banReason}` : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-green-700 dark:text-green-400">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      {/* Role toggle */}
                      {u.role === "admin" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSetRole(u.id, "user")}
                          disabled={isPending}
                        >
                          Demote
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSetRole(u.id, "admin")}
                          disabled={isPending}
                        >
                          Promote
                        </Button>
                      )}

                      {/* Enable/Disable */}
                      {u.banned ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEnable(u.id)}
                          disabled={isPending}
                        >
                          Enable
                        </Button>
                      ) : (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDisable(u.id)}
                          disabled={isPending}
                        >
                          Disable
                        </Button>
                      )}

                      {/* Reset password */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setResetUserId(u.id);
                          setResetPassword("");
                        }}
                        disabled={isPending}
                      >
                        Reset PW
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Reset password modal-like section */}
      {resetUserId && (
        <section className="rounded-lg border p-6 space-y-4">
          <h2 className="text-lg font-medium">
            Reset Password for{" "}
            {initialUsers.find((u) => u.id === resetUserId)?.username ??
              resetUserId}
          </h2>
          <form onSubmit={handleResetPassword} className="flex gap-4 items-end">
            <div className="flex-1 space-y-1.5">
              <label htmlFor="reset-pw" className="text-sm font-medium">
                New Password
              </label>
              <input
                id="reset-pw"
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                className={inputClasses}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" disabled={isPending}>
              Reset
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setResetUserId(null)}
              disabled={isPending}
            >
              Cancel
            </Button>
          </form>
        </section>
      )}
    </div>
  );
}
