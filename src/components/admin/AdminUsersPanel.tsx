"use client";

import { useActionState } from "react";
import {
  createUser,
  demoteFromAdmin,
  disableUser,
  enableUser,
  promoteToAdmin,
  resetUserPassword,
  type AdminActionState,
} from "@/lib/actions/admin/users";

type AdminUserRow = {
  id: string;
  username: string;
  displayName: string | null;
  role: "member" | "admin";
  disabled: boolean;
  lastSeenAt: string | null;
  createdAt: string;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function ActionMessage({ state }: { state: AdminActionState }) {
  if (state.error) {
    return (
      <p className="text-sm text-red-600" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return <p className="text-sm text-success">{state.success}</p>;
  }
  return null;
}

export function AdminUsersPanel({ users }: { users: AdminUserRow[] }) {
  const [createState, createAction, createPending] = useActionState<AdminActionState, FormData>(
    createUser,
    {},
  );

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <h2 className="text-lg font-medium text-text">Create user</h2>
        <form action={createAction} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-text">
              Username
            </label>
            <input
              id="username"
              name="username"
              required
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-text">
              Display name
            </label>
            <input
              id="displayName"
              name="displayName"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-text">
              Initial password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="role" className="block text-sm font-medium text-text">
              Role
            </label>
            <select
              id="role"
              name="role"
              defaultValue="member"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <ActionMessage state={createState} />
            <button
              type="submit"
              disabled={createPending}
              className="mt-2 inline-flex h-11 items-center rounded-md bg-accent px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              {createPending ? "Creating…" : "Create user"}
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
        <table className="min-w-full text-sm">
          <thead className="border-b border-border bg-accent-soft/50 text-left text-text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Username</th>
              <th className="px-4 py-3 font-medium">Display name</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Last seen</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <UserRow key={user.id} user={user} />
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function UserRow({ user }: { user: AdminUserRow }) {
  const [resetState, resetAction, resetPending] = useActionState<AdminActionState, FormData>(
    resetUserPassword,
    {},
  );
  const [toggleState, toggleAction, togglePending] = useActionState<AdminActionState, FormData>(
    user.disabled ? enableUser : disableUser,
    {},
  );
  const [promoteState, promoteAction, promotePending] = useActionState<AdminActionState, FormData>(
    user.role === "admin" ? demoteFromAdmin : promoteToAdmin,
    {},
  );

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3 font-medium text-text">{user.username}</td>
      <td className="px-4 py-3 text-text-muted">{user.displayName ?? "—"}</td>
      <td className="px-4 py-3 capitalize text-text-muted">{user.role}</td>
      <td className="px-4 py-3">
        <span
          className={
            user.disabled
              ? "rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700"
              : "rounded-full bg-success/10 px-2 py-0.5 text-xs text-success"
          }
        >
          {user.disabled ? "Disabled" : "Active"}
        </span>
      </td>
      <td className="px-4 py-3 text-text-muted">{formatDate(user.lastSeenAt)}</td>
      <td className="px-4 py-3">
        <div className="flex min-w-[16rem] flex-col gap-2">
          <form action={resetAction} className="flex gap-2">
            <input type="hidden" name="userId" value={user.id} />
            <input
              name="password"
              type="password"
              placeholder="New password"
              minLength={8}
              required
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
            />
            <button
              type="submit"
              disabled={resetPending}
              className="shrink-0 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent-soft disabled:opacity-50"
            >
              Reset
            </button>
          </form>
          <ActionMessage state={resetState} />
          <form action={toggleAction}>
            <input type="hidden" name="userId" value={user.id} />
            <button
              type="submit"
              disabled={togglePending}
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent-soft disabled:opacity-50"
            >
              {user.disabled ? "Enable" : "Disable"}
            </button>
          </form>
          <ActionMessage state={toggleState} />
          <form action={promoteAction}>
            <input type="hidden" name="userId" value={user.id} />
            <button
              type="submit"
              disabled={promotePending}
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent-soft disabled:opacity-50"
            >
              {user.role === "admin" ? "Demote to member" : "Promote to admin"}
            </button>
          </form>
          <ActionMessage state={promoteState} />
        </div>
      </td>
    </tr>
  );
}
