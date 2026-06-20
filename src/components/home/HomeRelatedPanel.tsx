"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { HomeLinkSourceType } from "@/db/schema/home";
import {
  linkHomeEntity,
  unlinkHomeEntity,
  searchMaintenanceForLink,
  searchInventoryForHomeLink,
  searchProjectsForHomeLink,
  type HomeActionState,
  type HomeResolvedLink,
} from "@/lib/actions/home";

function ActionMessage({ state }: { state: HomeActionState }) {
  if (state.error)
    return (
      <p className="text-sm text-red-600" role="alert">
        {state.error}
      </p>
    );
  if (state.success) return <p className="text-sm text-green-700">{state.success}</p>;
  return null;
}

function targetHref(targetType: string, targetId: string): string {
  switch (targetType) {
    case "maintenance_log":
      return `/maintenance/${targetId}`;
    case "inventory_item":
      return `/inventory/${targetId}`;
    case "project":
      return `/projects/${targetId}`;
    default:
      return "#";
  }
}

function targetLabel(targetType: string): string {
  switch (targetType) {
    case "maintenance_log":
      return "Maintenance";
    case "inventory_item":
      return "Inventory";
    case "project":
      return "Project";
    default:
      return targetType;
  }
}

export function HomeRelatedPanel({
  sourceType,
  sourceId,
  links,
}: {
  sourceType: HomeLinkSourceType;
  sourceId: string;
  links: HomeResolvedLink[];
}) {
  const [maintenanceQuery, setMaintenanceQuery] = useState("");
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const [maintenanceResults, setMaintenanceResults] = useState<{ id: string; title: string }[]>([]);
  const [inventoryResults, setInventoryResults] = useState<{ id: string; name: string }[]>([]);
  const [projectResults, setProjectResults] = useState<{ id: string; title: string }[]>([]);
  const [isSearching, startTransition] = useTransition();

  const [linkState, linkAction, linkPending] = useActionState<HomeActionState, FormData>(
    linkHomeEntity,
    {},
  );
  const [unlinkState, unlinkAction, unlinkPending] = useActionState<HomeActionState, FormData>(
    unlinkHomeEntity,
    {},
  );

  function searchMaintenance(value: string) {
    setMaintenanceQuery(value);
    startTransition(async () => {
      const results = await searchMaintenanceForLink(value);
      setMaintenanceResults(results);
    });
  }

  function searchInventory(value: string) {
    setInventoryQuery(value);
    startTransition(async () => {
      const results = await searchInventoryForHomeLink(value);
      setInventoryResults(results);
    });
  }

  function searchProjects(value: string) {
    setProjectQuery(value);
    startTransition(async () => {
      const results = await searchProjectsForHomeLink(value);
      setProjectResults(results);
    });
  }

  const maintenanceLinks = links.filter((l) => l.targetType === "maintenance_log");
  const inventoryLinks = links.filter((l) => l.targetType === "inventory_item");
  const projectLinks = links.filter((l) => l.targetType === "project");

  function LinkedItems({ items, targetType }: { items: HomeResolvedLink[]; targetType: string }) {
    if (items.length === 0) {
      return (
        <p className="mt-1 text-sm text-text-muted">
          No linked {targetLabel(targetType).toLowerCase()} items.
        </p>
      );
    }
    return (
      <ul className="mt-2 space-y-2">
        {items.map((link) => (
          <li
            key={link.id}
            className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
          >
            <Link href={targetHref(link.targetType, link.targetId)} className="text-sm text-accent">
              {link.targetName}
            </Link>
            <form action={unlinkAction}>
              <input type="hidden" name="sourceType" value={sourceType} />
              <input type="hidden" name="sourceId" value={sourceId} />
              <input type="hidden" name="targetType" value={link.targetType} />
              <input type="hidden" name="targetId" value={link.targetId} />
              <button
                type="submit"
                disabled={unlinkPending}
                className="text-xs text-text-muted hover:text-red-600"
              >
                Unlink
              </button>
            </form>
          </li>
        ))}
      </ul>
    );
  }

  function SearchResults({
    results,
    nameKey,
    targetType,
  }: {
    results: Array<{ id: string } & Record<string, string>>;
    nameKey: string;
    targetType: string;
  }) {
    if (results.length === 0) return null;
    return (
      <ul className="mt-2 space-y-1">
        {results.map((result) => (
          <li key={result.id}>
            <form action={linkAction} className="flex items-center justify-between gap-2">
              <input type="hidden" name="sourceType" value={sourceType} />
              <input type="hidden" name="sourceId" value={sourceId} />
              <input type="hidden" name="targetType" value={targetType} />
              <input type="hidden" name="targetId" value={result.id} />
              <span className="text-sm text-text">{result[nameKey]}</span>
              <Button type="submit" disabled={linkPending} className="text-xs">
                Link
              </Button>
            </form>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <h2 className="text-sm font-medium text-text">Linked items</h2>
      <p className="mt-1 text-xs text-text-muted">
        Connect this {sourceType === "home_space" ? "space" : "item"} to maintenance logs,
        inventory, and projects.
      </p>

      <div className="mt-4 space-y-5">
        {/* Maintenance */}
        <div>
          <h3 className="text-sm font-medium text-text-muted">Maintenance logs</h3>
          <LinkedItems items={maintenanceLinks} targetType="maintenance_log" />
          <div className="mt-3 space-y-2">
            <input
              type="search"
              value={maintenanceQuery}
              onChange={(e) => searchMaintenance(e.target.value)}
              placeholder="Search maintenance to link…"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            {isSearching && <p className="text-xs text-text-muted">Searching…</p>}
            <SearchResults
              results={maintenanceResults}
              nameKey="title"
              targetType="maintenance_log"
            />
          </div>
        </div>

        {/* Inventory */}
        <div>
          <h3 className="text-sm font-medium text-text-muted">Inventory items</h3>
          <LinkedItems items={inventoryLinks} targetType="inventory_item" />
          <div className="mt-3 space-y-2">
            <input
              type="search"
              value={inventoryQuery}
              onChange={(e) => searchInventory(e.target.value)}
              placeholder="Search inventory to link…"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <SearchResults results={inventoryResults} nameKey="name" targetType="inventory_item" />
          </div>
        </div>

        {/* Projects */}
        <div>
          <h3 className="text-sm font-medium text-text-muted">Projects</h3>
          <LinkedItems items={projectLinks} targetType="project" />
          <div className="mt-3 space-y-2">
            <input
              type="search"
              value={projectQuery}
              onChange={(e) => searchProjects(e.target.value)}
              placeholder="Search projects to link…"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <SearchResults results={projectResults} nameKey="title" targetType="project" />
          </div>
        </div>
      </div>

      <ActionMessage state={linkState} />
      <ActionMessage state={unlinkState} />
    </section>
  );
}
