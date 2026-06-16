"use client";

import { useActionState } from "react";
import { togglePin, markDone, type StreamActionState } from "@/lib/actions/stream";
import { FormSubmitButton } from "@/components/ui/FormSubmitButton";
import type { StreamEntryWithAuthor } from "@/components/StreamEntryList";

export function StreamEntryActions({ entry }: { entry: StreamEntryWithAuthor }) {
  const [pinState, pinAction, pinPending] = useActionState<StreamActionState, FormData>(
    async (_prev, formData) => togglePin(formData),
    {},
  );
  const [doneState, doneAction, donePending] = useActionState<StreamActionState, FormData>(
    async (_prev, formData) => markDone(formData),
    {},
  );

  if (entry.doneAt) {
    return null;
  }

  const error = pinState.error ?? doneState.error;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex shrink-0 gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        <form action={pinAction}>
          <input type="hidden" name="id" value={entry.id} />
          <FormSubmitButton
            pendingLabel="…"
            disabled={pinPending || donePending}
            className="rounded-md px-2 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-accent-soft hover:text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
          >
            {entry.isPinned ? "Unpin" : "Pin"}
          </FormSubmitButton>
        </form>
        <form action={doneAction}>
          <input type="hidden" name="id" value={entry.id} />
          <FormSubmitButton
            pendingLabel="…"
            disabled={pinPending || donePending}
            className="rounded-md px-2 py-1 text-xs font-medium text-success transition-colors hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
          >
            Done
          </FormSubmitButton>
        </form>
      </div>
      {error ? (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
