"use client";

import { togglePin, markDone } from "@/lib/actions/stream";
import { FormSubmitButton } from "@/components/ui/FormSubmitButton";
import type { StreamEntryWithAuthor } from "@/components/StreamEntryList";

export function StreamEntryActions({ entry }: { entry: StreamEntryWithAuthor }) {
  if (entry.doneAt) {
    return null;
  }

  return (
    <div className="flex shrink-0 gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
      <form action={togglePin}>
        <input type="hidden" name="id" value={entry.id} />
        <FormSubmitButton
          pendingLabel="…"
          className="rounded-md px-2 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-accent-soft hover:text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
        >
          {entry.isPinned ? "Unpin" : "Pin"}
        </FormSubmitButton>
      </form>
      <form action={markDone}>
        <input type="hidden" name="id" value={entry.id} />
        <FormSubmitButton
          pendingLabel="…"
          className="rounded-md px-2 py-1 text-xs font-medium text-success transition-colors hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
        >
          Done
        </FormSubmitButton>
      </form>
    </div>
  );
}
