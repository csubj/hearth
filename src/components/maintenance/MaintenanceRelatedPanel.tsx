"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { MaintenanceDetail } from "@/lib/actions/maintenance";
import {
  linkMaintenanceInventoryItem,
  linkMaintenanceProject,
  searchInventoryForLink,
  searchProjectsForLink,
  unlinkMaintenanceInventoryItem,
  unlinkMaintenanceProject,
  type MaintenanceActionState,
} from "@/lib/actions/maintenance";

function ActionMessage({ state }: { state: MaintenanceActionState }) {
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

export function MaintenanceRelatedPanel({ log }: { log: MaintenanceDetail }) {
  const [projectQuery, setProjectQuery] = useState("");
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [projectResults, setProjectResults] = useState<{ id: string; title: string }[]>([]);
  const [inventoryResults, setInventoryResults] = useState<{ id: string; name: string }[]>([]);
  const [isSearching, startTransition] = useTransition();

  const [linkProjectState, linkProjectAction, linkProjectPending] = useActionState<
    MaintenanceActionState,
    FormData
  >(linkMaintenanceProject, {});
  const [unlinkProjectState, unlinkProjectAction, unlinkProjectPending] = useActionState<
    MaintenanceActionState,
    FormData
  >(unlinkMaintenanceProject, {});
  const [linkInventoryState, linkInventoryAction, linkInventoryPending] = useActionState<
    MaintenanceActionState,
    FormData
  >(linkMaintenanceInventoryItem, {});
  const [unlinkInventoryState, unlinkInventoryAction, unlinkInventoryPending] = useActionState<
    MaintenanceActionState,
    FormData
  >(unlinkMaintenanceInventoryItem, {});

  function searchProjects(value: string) {
    setProjectQuery(value);
    startTransition(async () => {
      const results = await searchProjectsForLink(value);
      setProjectResults(results);
    });
  }

  function searchInventory(value: string) {
    setInventoryQuery(value);
    startTransition(async () => {
      const results = await searchInventoryForLink(value);
      setInventoryResults(results);
    });
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <h2 className="text-sm font-medium text-text">Related items</h2>

      <div className="mt-4 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-text-muted">Projects</h3>
          {log.relatedProjects.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {log.relatedProjects.map((project) => (
                <li
                  key={project.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <Link href={`/projects/${project.id}`} className="text-sm text-accent">
                    {project.title}
                  </Link>
                  <form action={unlinkProjectAction}>
                    <input type="hidden" name="maintenanceLogId" value={log.id} />
                    <input type="hidden" name="projectId" value={project.id} />
                    <button
                      type="submit"
                      disabled={unlinkProjectPending}
                      className="text-xs text-text-muted hover:text-red-600"
                    >
                      Unlink
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-text-muted">No linked projects.</p>
          )}
          <div className="mt-3 space-y-2">
            <input
              type="search"
              value={projectQuery}
              onChange={(event) => searchProjects(event.target.value)}
              placeholder="Search projects to link…"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            {isSearching ? <p className="text-xs text-text-muted">Searching…</p> : null}
            {projectResults.length > 0 ? (
              <ul className="space-y-1">
                {projectResults.map((project) => (
                  <li key={project.id}>
                    <form
                      action={linkProjectAction}
                      className="flex items-center justify-between gap-2"
                    >
                      <input type="hidden" name="maintenanceLogId" value={log.id} />
                      <input type="hidden" name="projectId" value={project.id} />
                      <span className="text-sm text-text">{project.title}</span>
                      <Button type="submit" disabled={linkProjectPending} className="text-xs">
                        Link
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <ActionMessage state={linkProjectState} />
          <ActionMessage state={unlinkProjectState} />
        </div>

        <div>
          <h3 className="text-sm font-medium text-text-muted">Inventory items</h3>
          {log.relatedInventoryItems.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {log.relatedInventoryItems.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <Link href={`/inventory/${item.id}`} className="text-sm text-accent">
                    {item.name}
                  </Link>
                  <form action={unlinkInventoryAction}>
                    <input type="hidden" name="maintenanceLogId" value={log.id} />
                    <input type="hidden" name="inventoryItemId" value={item.id} />
                    <button
                      type="submit"
                      disabled={unlinkInventoryPending}
                      className="text-xs text-text-muted hover:text-red-600"
                    >
                      Unlink
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-text-muted">No linked inventory items.</p>
          )}
          <div className="mt-3 space-y-2">
            <input
              type="search"
              value={inventoryQuery}
              onChange={(event) => searchInventory(event.target.value)}
              placeholder="Search inventory to link…"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            {inventoryResults.length > 0 ? (
              <ul className="space-y-1">
                {inventoryResults.map((item) => (
                  <li key={item.id}>
                    <form
                      action={linkInventoryAction}
                      className="flex items-center justify-between gap-2"
                    >
                      <input type="hidden" name="maintenanceLogId" value={log.id} />
                      <input type="hidden" name="inventoryItemId" value={item.id} />
                      <span className="text-sm text-text">{item.name}</span>
                      <Button type="submit" disabled={linkInventoryPending} className="text-xs">
                        Link
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <ActionMessage state={linkInventoryState} />
          <ActionMessage state={unlinkInventoryState} />
        </div>
      </div>
    </section>
  );
}
