"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { ProjectDetail } from "@/lib/actions/projects";
import {
  addLink,
  removeLink,
  setTags,
  type ProjectActionState,
} from "@/lib/actions/projects";

function ActionMessage({ state }: { state: ProjectActionState }) {
  if (state.error) {
    return (
      <p className="text-sm text-red-600" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return <p className="text-sm text-green-700">{state.success}</p>;
  }
  return null;
}

export function ProjectLinksPanel({ project }: { project: ProjectDetail }) {
  const [addState, addAction, addPending] = useActionState<ProjectActionState, FormData>(
    addLink,
    {},
  );
  const [removeState, removeAction, removePending] = useActionState<
    ProjectActionState,
    FormData
  >(removeLink, {});

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <h2 className="text-sm font-medium text-text">Links</h2>
      {project.links.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {project.links.map((link) => (
            <li
              key={link.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent hover:text-accent/80"
              >
                {link.label}
              </a>
              <form action={removeAction}>
                <input type="hidden" name="linkId" value={link.id} />
                <input type="hidden" name="projectId" value={project.id} />
                <button
                  type="submit"
                  disabled={removePending}
                  className="text-xs text-text-muted hover:text-red-600"
                >
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-text-muted">No links yet.</p>
      )}

      <form action={addAction} className="mt-4 grid gap-2 sm:grid-cols-2">
        <input type="hidden" name="projectId" value={project.id} />
        <input
          name="label"
          required
          placeholder="Label"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <input
          name="url"
          required
          type="url"
          placeholder="https://…"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" disabled={addPending}>
            {addPending ? "Adding…" : "Add link"}
          </Button>
          <ActionMessage state={addState} />
        </div>
      </form>
      <ActionMessage state={removeState} />
    </section>
  );
}

export function ProjectTagsForm({ project }: { project: ProjectDetail }) {
  const [state, action, pending] = useActionState<ProjectActionState, FormData>(setTags, {});
  const tagValue = project.tags.map((tag) => tag.name).join(", ");

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <h2 className="text-sm font-medium text-text">Tags</h2>
      <form action={action} className="mt-3 space-y-2">
        <input type="hidden" name="projectId" value={project.id} />
        <input
          name="tags"
          defaultValue={tagValue}
          placeholder="garage, electrical"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <p className="text-xs text-text-muted">Comma-separated tag names.</p>
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save tags"}
          </Button>
          <ActionMessage state={state} />
        </div>
      </form>
    </section>
  );
}
