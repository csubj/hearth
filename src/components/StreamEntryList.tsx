import { Suspense } from "react";
import { updateEntry } from "@/lib/actions/stream";
import type { MentionUser } from "@/components/MentionTextarea";
import { Attachments } from "@/components/Attachments";
import { StreamEntryActions } from "@/components/StreamEntryActions";
import { StreamEntryEditForm } from "@/components/StreamEntryEditForm";

export type StreamEntryWithAuthor = {
  id: string;
  body: string;
  isPinned: boolean;
  doneAt: Date | null;
  roughWhen: string | null;
  createdAt: Date;
  authorName: string;
};

function formatWhen(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StreamEntryRow({
  entry,
  showActions,
  users,
}: {
  entry: StreamEntryWithAuthor;
  showActions: boolean;
  users: MentionUser[];
}) {
  const isDone = Boolean(entry.doneAt);

  return (
    <article
      id={`entry-${entry.id}`}
      className={`group rounded-lg border bg-surface p-4 shadow-card ${
        isDone ? "border-border/60" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p
            className={`text-base leading-relaxed whitespace-pre-wrap ${
              isDone ? "text-text-muted line-through" : "text-text"
            }`}
          >
            {entry.body}
          </p>
          <p className="text-sm text-text-muted">
            {entry.authorName}
            <span aria-hidden="true"> · </span>
            <time dateTime={entry.createdAt.toISOString()}>{formatWhen(entry.createdAt)}</time>
            {entry.roughWhen ? (
              <>
                <span aria-hidden="true"> · </span>
                <span>{entry.roughWhen}</span>
              </>
            ) : null}
            {entry.isPinned && !isDone ? (
              <>
                <span aria-hidden="true"> · </span>
                <span className="text-accent">Pinned</span>
              </>
            ) : null}
          </p>
        </div>
        {showActions ? <StreamEntryActions entry={entry} /> : null}
      </div>
      {showActions && !isDone ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-text-muted hover:text-text">Edit</summary>
          <div className="mt-2">
            <StreamEntryEditForm entry={entry} action={updateEntry} users={users} />
          </div>
        </details>
      ) : null}
      <div className="mt-3 border-t border-border pt-3">
        <Suspense fallback={<p className="text-sm text-text-muted">Loading photos…</p>}>
          <Attachments entityType="stream_entry" entityId={entry.id} />
        </Suspense>
      </div>
    </article>
  );
}

export function StreamEntryList({
  openEntries,
  doneEntries,
  emptyMessage = "Nothing here yet. Add a note above.",
  showActions = true,
  users = [],
}: {
  openEntries: StreamEntryWithAuthor[];
  doneEntries?: StreamEntryWithAuthor[];
  emptyMessage?: string;
  showActions?: boolean;
  users?: MentionUser[];
}) {
  const hasDone = doneEntries && doneEntries.length > 0;

  if (openEntries.length === 0 && !hasDone) {
    return <p className="text-sm text-text-muted">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-6">
      {openEntries.length > 0 ? (
        <ul className="space-y-3">
          {openEntries.map((entry) => (
            <li key={entry.id}>
              <StreamEntryRow entry={entry} showActions={showActions} users={users} />
            </li>
          ))}
        </ul>
      ) : null}
      {hasDone ? (
        <section>
          <h2 className="mb-3 text-sm font-medium text-text-muted">Done</h2>
          <ul className="space-y-3">
            {doneEntries!.map((entry) => (
              <li key={entry.id}>
                <StreamEntryRow entry={entry} showActions={showActions} users={users} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
