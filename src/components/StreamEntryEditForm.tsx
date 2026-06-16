"use client";

import { useActionState } from "react";
import { MentionTextarea, type MentionUser } from "@/components/MentionTextarea";
import type { StreamActionState } from "@/lib/actions/stream";
import type { StreamEntryWithAuthor } from "@/components/StreamEntryList";

export function StreamEntryEditForm({
  entry,
  action,
  users = [],
}: {
  entry: StreamEntryWithAuthor;
  action: (prev: StreamActionState, formData: FormData) => Promise<StreamActionState>;
  users?: MentionUser[];
}) {
  const [state, formAction, pending] = useActionState<StreamActionState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={entry.id} />
      <MentionTextarea name="body" users={users} defaultValue={entry.body} rows={3} required />
      <input
        name="roughWhen"
        type="text"
        defaultValue={entry.roughWhen ?? ""}
        placeholder="When (optional)"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      />
      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 items-center justify-center rounded-md bg-accent px-3 text-sm font-medium text-white transition-colors hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
