"use client";

/**
 * Command palette (task 12.3, design D10 "Palette").
 *
 * Cmd/Ctrl-K opens a global palette (from anywhere in the app) that:
 *   - searches entities via the search procedure (debounced 150 ms, up to 20
 *     results) and, on Enter, navigates to the entity's detail page;
 *   - offers actions: go to a section, create any module type, and switch the
 *     active property.
 *
 * Results are keyboard navigable (ArrowUp/Down/Enter/Escape), handled natively
 * by cmdk (design D10). It reads via the `invoke` server action and is mounted
 * globally by the app layout so Cmd/Ctrl-K works on every page.
 */

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { invoke } from "@/lib/actions/invoke";
import { buildPaletteItems, type ActionItem, type EntityItem, type PaletteItem } from "./command-palette-items";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CommandPaletteModule {
  type: string;
  singular: string;
  plural: string;
}

export interface CommandPaletteProperty {
  id: string;
  title: string;
}

export interface CommandPaletteProps {
  modules: CommandPaletteModule[];
  properties: CommandPaletteProperty[];
  currentScope: string | null;
}

// ---------------------------------------------------------------------------
// Sections the palette can jump to (existing routes in the app shell).
// ---------------------------------------------------------------------------

const SECTIONS: ActionItem[] = [
  { kind: "action", id: "today", label: "Go to Today", hint: "Home", href: "/" },
  { kind: "action", id: "inbox", label: "Go to Inbox", href: "/inbox" },
  { kind: "action", id: "places", label: "Go to Places", href: "/places" },
  { kind: "action", id: "settings", label: "Go to Settings", href: "/settings" },
  { kind: "action", id: "api-keys", label: "Go to API keys", href: "/api-keys" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette({
  modules,
  properties,
  currentScope,
}: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EntityItem[]>([]);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Global Cmd/Ctrl-K open/close.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Debounce the search query by 150 ms.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(timer);
  }, [query]);

  // Run the search when the debounced query changes, building entity palette
  // items. Only updated from the async completion to avoid cascading renders.
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q === "") {
      setResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const [, data] = await invoke("search", { q, limit: 20 });
      if (cancelled) return;
      const rows =
        (
          data as {
            data?: Array<{
              id: string;
              type: string;
              title: string;
              snippet?: string | null;
              placeTitle?: string | null;
            }>;
          } | undefined
        )?.data ?? [];
      setResults(
        rows.map((r) => ({
          kind: "entity" as const,
          id: r.id,
          type: r.type,
          title: r.title,
          snippet: r.snippet ?? null,
          placeTitle: r.placeTitle ?? null,
          href: `/${r.type}/${r.id}`,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  // Build the action list (reset each render so it reflects current scope).
  const createActions: ActionItem[] = modules.map((m) => ({
    kind: "action",
    id: `create-${m.type}`,
    label: `Create ${m.singular}`,
    hint: m.plural,
    href: `/${m.type}`,
  }));

  const propertyActions: ActionItem[] = properties.map((p) => ({
    kind: "action",
    id: `switch-${p.id}`,
    label: `Switch to ${p.title}`,
    hint: p.id === currentScope ? "Current" : "Property",
    onSelect: () => {
      void invoke("updatePreferences", { propertyScope: p.id });
    },
  }));

  const actions: ActionItem[] = [...SECTIONS, ...createActions, ...propertyActions];

  const items: PaletteItem[] = buildPaletteItems(debouncedQuery, results, actions);

  const execute = useCallback(
    (item: PaletteItem) => {
      if (item.kind === "entity" || item.href) {
        router.push(item.href!);
      } else if (item.kind === "action" && item.onSelect) {
        item.onSelect();
      }
      setOpen(false);
      setQuery("");
    },
    [router],
  );

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} />}
      {open && (
        <Command
          className="fixed left-1/2 top-[20%] z-50 w-[min(90vw,560px)] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-background shadow-xl"
          shouldFilter={false}
          value={query}
          onValueChange={setQuery}
          loop
          label="Command palette"
        >
      <Command.Input
        autoFocus
        placeholder="Search entities or run a command…"
        className="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
        data-testid="palette-input"
      />
      <Command.List className="max-h-72 overflow-y-auto p-2" data-testid="palette-results">
        {items.length === 0 && (
          <Command.Empty className="px-3 py-2 text-sm text-muted-foreground">
            No results
          </Command.Empty>
        )}
        {items.map((item) => (
          <Command.Item
            key={`${item.kind}-${item.id}`}
            value={`${item.kind}:${item.id}`}
            onSelect={() => execute(item)}
            className="flex cursor-pointer flex-col gap-0.5 rounded-md px-3 py-2 text-sm data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate font-medium">
                {item.kind === "entity" ? item.title : item.label}
              </span>
              {item.kind === "entity" && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {item.type}
                </span>
              )}
            </span>
            {(item.kind === "entity"
              ? item.snippet ?? item.placeTitle ?? ""
              : item.hint ?? ""
            ) ? (
              <span className="truncate text-xs text-muted-foreground">
                {item.kind === "entity"
                  ? (item.snippet ?? item.placeTitle)
                  : item.hint}
              </span>
            ) : null}
          </Command.Item>
        ))}
        </Command.List>
        </Command>
      )}
    </>
  );
}
