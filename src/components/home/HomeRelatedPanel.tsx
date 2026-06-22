"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { HomeLinkSourceType, HomeLinkTargetType } from "@/db/schema/home";
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
  only,
}: {
  sourceType: HomeLinkSourceType;
  sourceId: string;
  links: HomeResolvedLink[];
  only?: HomeLinkTargetType;
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

  const categories: Array<{
    targetType: HomeLinkTargetType;
    title: string;
    items: HomeResolvedLink[];
    query: string;
    results: Array<{ id: string } & Record<string, string>>;
    nameKey: string;
    search: (value: string) => void;
  }> = [
    {
      targetType: "maintenance_log",
      title: "Maintenance logs",
      items: maintenanceLinks,
      query: maintenanceQuery,
      results: maintenanceResults,
      nameKey: "title",
      search: searchMaintenance,
    },
    {
      targetType: "inventory_item",
      title: "Inventory items",
      items: inventoryLinks,
      query: inventoryQuery,
      results: inventoryResults,
      nameKey: "name",
      search: searchInventory,
    },
    {
      targetType: "project",
      title: "Projects",
      items: projectLinks,
      query: projectQuery,
      results: projectResults,
      nameKey: "title",
      search: searchProjects,
    },
  ];

  const visibleCategories = only ? categories.filter((c) => c.targetType === only) : categories;

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
      <h2 className="text-sm font-medium text-text">{only ? targetLabel(only) : "Linked items"}</h2>
      <p className="mt-1 text-xs text-text-muted">
        Connect this {sourceType === "home_space" ? "space" : "item"} to{" "}
        {only ? targetLabel(only).toLowerCase() : "maintenance logs, inventory, and projects"}.
      </p>

      <div className="mt-4 space-y-5">
        {visibleCategories.map((category) => (
          <div key={category.targetType}>
            {!only && <h3 className="text-sm font-medium text-text-muted">{category.title}</h3>}
            <LinkedItems items={category.items} targetType={category.targetType} />
            <div className="mt-3 space-y-2">
              <input
                type="search"
                value={category.query}
                onChange={(e) => category.search(e.target.value)}
                placeholder={`Search ${targetLabel(category.targetType).toLowerCase()} to link…`}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              {isSearching && <p className="text-xs text-text-muted">Searching…</p>}
              <SearchResults
                results={category.results}
                nameKey={category.nameKey}
                targetType={category.targetType}
              />
            </div>
          </div>
        ))}
      </div>

      <ActionMessage state={linkState} />
      <ActionMessage state={unlinkState} />
    </section>
  );
}
