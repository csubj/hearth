"use client";

import { useActionState } from "react";
import {
  createToken,
  revokeToken,
  type ApiTokenActionState,
} from "@/lib/actions/admin/api-tokens";

type TokenRow = {
  id: string;
  name: string;
  prefix: string;
  username: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type UserOption = {
  id: string;
  username: string;
  displayName: string | null;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function ActionMessage({ state }: { state: ApiTokenActionState }) {
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

export function AdminApiTokensPanel({
  tokens,
  users,
}: {
  tokens: TokenRow[];
  users: UserOption[];
}) {
  const [createState, createAction, createPending] = useActionState<
    ApiTokenActionState,
    FormData
  >(createToken, {});
  const [revokeState, revokeAction, revokePending] = useActionState<
    ApiTokenActionState,
    FormData
  >(revokeToken, {});

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <h2 className="text-lg font-medium text-text">Create API token</h2>
        <p className="mt-1 text-sm text-text-muted">
          Tokens authenticate requests to <code className="text-xs">/api/v1/*</code>. The full
          secret is shown once at creation.
        </p>
        <form action={createAction} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-text">
              Label
            </label>
            <input
              id="name"
              name="name"
              required
              placeholder="home automation"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="userId" className="block text-sm font-medium text-text">
              Acts as user
            </label>
            <select
              id="userId"
              name="userId"
              required
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              defaultValue=""
            >
              <option value="" disabled>
                Select user…
              </option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName ?? user.username} (@{user.username})
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={createPending}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {createPending ? "Creating…" : "Create token"}
            </button>
          </div>
        </form>
        <div className="mt-3 space-y-2">
          <ActionMessage state={createState} />
          {createState.token ? (
            <div className="rounded-md border border-border bg-background p-3">
              <p className="text-xs font-medium text-text-muted">Copy this token now</p>
              <code className="mt-1 block break-all text-sm text-text">{createState.token}</code>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <h2 className="text-lg font-medium text-text">API tokens</h2>
        <ActionMessage state={revokeState} />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Prefix</th>
                <th className="py-2 pr-4 font-medium">User</th>
                <th className="py-2 pr-4 font-medium">Last used</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tokens.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 text-text-muted">
                    No API tokens yet.
                  </td>
                </tr>
              ) : (
                tokens.map((token) => (
                  <tr key={token.id} className="border-b border-border/60">
                    <td className="py-3 pr-4 text-text">{token.name}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-text-muted">{token.prefix}…</td>
                    <td className="py-3 pr-4 text-text-muted">@{token.username}</td>
                    <td className="py-3 pr-4 text-text-muted">{formatDate(token.lastUsedAt)}</td>
                    <td className="py-3 pr-4">
                      {token.revokedAt ? (
                        <span className="text-red-600">Revoked</span>
                      ) : (
                        <span className="text-success">Active</span>
                      )}
                    </td>
                    <td className="py-3">
                      {!token.revokedAt ? (
                        <form action={revokeAction}>
                          <input type="hidden" name="tokenId" value={token.id} />
                          <button
                            type="submit"
                            disabled={revokePending}
                            className="text-sm text-red-600 hover:underline disabled:opacity-50"
                          >
                            Revoke
                          </button>
                        </form>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
