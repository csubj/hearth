"use client";

import { useActionState } from "react";
import { MentionTextarea, type MentionUser } from "@/components/MentionTextarea";
import { createEntry, type StreamActionState } from "@/lib/actions/stream";

export function StreamCaptureForm({ users = [] }: { users?: MentionUser[] }) {
  const [state, formAction, pending] = useActionState<StreamActionState, FormData>(createEntry, {});

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-card"
    >
      <div>
        <label htmlFor="stream-body" className="sr-only">
          New note
        </label>
        <MentionTextarea
          id="stream-body"
          name="body"
          users={users}
          rows={3}
          placeholder="What's on your mind?"
          required
        />
      </div>
      <div>
        <label htmlFor="stream-rough-when" className="block text-sm font-medium text-text">
          When <span className="font-normal text-text-muted">(optional)</span>
        </label>
        <input
          id="stream-rough-when"
          name="roughWhen"
          type="text"
          placeholder="this week, before trip…"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        />
      </div>
      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
    </form>
  );
}
