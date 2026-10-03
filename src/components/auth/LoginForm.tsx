"use client";

import { useActionState } from "react";
import { login, type AuthActionState } from "@/lib/actions/auth";

export function LoginForm({ returnTo }: { returnTo: string }) {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(login, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="returnTo" value={returnTo} />
      <div>
        <label htmlFor="username" className="block text-xs uppercase tracking-[0.1em] text-text-muted">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          className="mt-1.5 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus-visible:outline-none"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-xs uppercase tracking-[0.1em] text-text-muted">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1.5 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus-visible:outline-none"
        />
      </div>
      {state.error ? (
        <p className="text-sm text-accent" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center rounded-sm border border-accent bg-accent-soft/70 px-4 text-sm font-medium uppercase tracking-[0.06em] text-accent transition-colors hover:bg-accent-soft focus-visible:outline-none disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}