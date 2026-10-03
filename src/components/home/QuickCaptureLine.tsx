"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { create, type ProjectActionState } from "@/lib/actions/projects";

export function QuickCaptureLine() {
  const [state, action, pending] = useActionState<ProjectActionState, FormData>(create, {});
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.success) {
      setText("");
      inputRef.current?.focus();
    }
  }, [state.success]);

  return (
    <form action={action} className="border-t border-border pt-4">
      <label
        htmlFor="quick-line"
        className="block text-xs uppercase tracking-[0.12em] text-text-muted"
      >
        Write a line to the record
      </label>
      <div className="mt-2 flex items-end gap-3">
        <input
          ref={inputRef}
          id="quick-line"
          name="title"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="A thought, an errand, something not to lose…"
          className="min-w-0 flex-1 border-b border-border bg-transparent pb-1 text-base text-text placeholder:text-text-muted focus:border-accent focus-visible:outline-none"
        />
        <button
          type="submit"
          disabled={pending || !text.trim()}
          className="shrink-0 border border-accent px-3 py-1.5 text-xs uppercase tracking-[0.06em] text-accent transition-colors hover:bg-accent-soft disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      <input type="hidden" name="redirect" value="none" />
      <input type="hidden" name="status" value="idea" />
    </form>
  );
}