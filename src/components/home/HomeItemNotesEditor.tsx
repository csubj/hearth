"use client";

import { useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MentionTextarea, type MentionUser } from "@/components/MentionTextarea";
import { updateHomeItemNotes } from "@/lib/actions/home";
import { useAutoSave } from "@/lib/hooks/useAutoSave";

function SaveStatus({
  status,
  errorMessage,
}: {
  status: ReturnType<typeof useAutoSave>["status"];
  errorMessage: string | null;
}) {
  if (status === "error" && errorMessage) {
    return (
      <p className="text-sm text-red-600" role="alert">
        {errorMessage}
      </p>
    );
  }
  if (status === "saving" || status === "pending") {
    return <p className="text-sm text-text-muted">Saving…</p>;
  }
  if (status === "saved") {
    return <p className="text-sm text-success">Saved</p>;
  }
  return null;
}

export function HomeItemNotesEditor({
  itemId,
  initialNotes,
  users = [],
}: {
  itemId: string;
  initialNotes: string | null;
  users?: MentionUser[];
}) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  const saveNotes = useCallback(
    async (value: string) => updateHomeItemNotes(itemId, value),
    [itemId],
  );

  const { status, errorMessage, flush } = useAutoSave({
    value: notes,
    onSave: saveNotes,
  });

  async function handleBlur() {
    await flush();
    await updateHomeItemNotes(itemId, notes);
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium text-text">Notes</h2>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setMode("edit")}
              className={`rounded px-2 py-1 ${mode === "edit" ? "bg-accent text-white" : "text-text-muted"}`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setMode("preview")}
              className={`rounded px-2 py-1 ${mode === "preview" ? "bg-accent text-white" : "text-text-muted"}`}
            >
              Preview
            </button>
          </div>
          <SaveStatus status={status} errorMessage={errorMessage} />
        </div>
      </div>
      {mode === "edit" ? (
        <MentionTextarea
          name="notes"
          users={users}
          rows={8}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={handleBlur}
          className="mt-3 w-full"
          placeholder="Installation notes, warranty info, quirks, part numbers…"
        />
      ) : (
        <div className="prose prose-sm mt-3 max-w-none text-text">
          {notes.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{notes}</ReactMarkdown>
          ) : (
            <p className="text-sm text-text-muted">No notes yet.</p>
          )}
        </div>
      )}
    </section>
  );
}
