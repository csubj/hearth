"use client";

/**
 * Shared EntityList (task 13.3, design D2/D16/D17).
 *
 * The single list view used by every module: a search box, filter chips for
 * tags and module fields, URL-synced filters, declared sorts, columns on wide
 * screens and stacked rows on narrow screens, and infinite scroll.
 *
 * Data loads through the module's generated `list` procedure (cursor
 * pagination, D16) via `invoke`. Filters and sort are reflected in the URL
 * and restored on reload.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { invoke } from "@/lib/actions/invoke";
import { formatFieldValue, type FieldDescriptor } from "@/lib/module-fields";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EntityListProps {
  moduleType: string;
  label: { singular: string; plural: string };
  fields: FieldDescriptor[];
  listColumns: FieldDescriptor[];
  filterKeys: string[];
  sortKeys: string[];
  initialData: Record<string, unknown>[];
  initialCursor: string | null;
  initialSort?: string;
  initialSortDirection?: string;
  initialFilters: Record<string, unknown>;
  showTagFilter?: boolean;
  loadError?: string | null;
  renderCreate?: (open: () => void) => React.ReactNode;
}

function procedurePrefix(type: string): string {
  return type.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function labelForSort(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EntityList({
  moduleType,
  label,
  fields,
  listColumns,
  filterKeys,
  sortKeys,
  initialData,
  initialCursor,
  initialSort,
  initialSortDirection,
  initialFilters,
  showTagFilter,
  loadError,
  renderCreate,
}: EntityListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState(initialData);
  const [cursor, setCursor] = useState(initialCursor);
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState(initialFilters);
  const [tagFilter, setTagFilter] = useState(
    (initialFilters.tag as string) ?? "",
  );
  const [isLoadingMore, startLoadMore] = useTransition();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const prefix = procedurePrefix(moduleType);
  const fieldMap = useMemo(
    () => new Map(fields.map((f) => [f.key, f])),
    [fields],
  );

  // -----------------------------------------------------------------------
  // Load more (cursor pagination, D16)
  // -----------------------------------------------------------------------
  const loadMore = useCallback(() => {
    if (!cursor) return;
    startLoadMore(async () => {
      const [error, result] = await invoke(`${prefix}List`, {
        sort: initialSort ?? undefined,
        sortDirection: initialSortDirection ?? undefined,
        cursor,
        limit: 50,
        filters:
          Object.keys(activeFilters).length > 0 ? activeFilters : undefined,
      });
      if (!error && result) {
        const r = result as {
          data: Record<string, unknown>[];
          nextCursor: string | null;
        };
        setData((prev) => [...prev, ...r.data]);
        setCursor(r.nextCursor);
      }
    });
  }, [cursor, prefix, initialSort, initialSortDirection, activeFilters]);

  // -----------------------------------------------------------------------
  // Infinite scroll — load more when the sentinel enters the viewport.
  // -----------------------------------------------------------------------
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !cursor) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  // -----------------------------------------------------------------------
  // Filters — written to the URL as `f_<key>` so they survive reload.
  // -----------------------------------------------------------------------
  const applyFilter = useCallback(
    (key: string, value: string) => {
      const next = { ...activeFilters };
      if (value === "" || value === "__all__") delete next[key];
      else next[key] = value;
      setActiveFilters(next);

      const sp = new URLSearchParams(searchParams.toString());
      if (value === "" || value === "__all__") sp.delete(`f_${key}`);
      else sp.set(`f_${key}`, value);
      router.replace(`/${moduleType}?${sp.toString()}`);
    },
    [activeFilters, moduleType, router, searchParams],
  );

  const applySort = useCallback(
    (sortKey: string) => {
      const sp = new URLSearchParams(searchParams.toString());
      const currentSort = sp.get("sort");
      const currentDir = sp.get("sortDirection") ?? "desc";
      if (currentSort === sortKey) {
        sp.set("sortDirection", currentDir === "asc" ? "desc" : "asc");
      } else {
        sp.set("sort", sortKey);
        sp.set("sortDirection", "desc");
      }
      router.replace(`/${moduleType}?${sp.toString()}`);
    },
    [moduleType, router, searchParams],
  );

  const applyTagFilter = useCallback(() => {
    const sp = new URLSearchParams(searchParams.toString());
    if (tagFilter.trim()) sp.set("f_tag", tagFilter.trim());
    else sp.delete("f_tag");
    router.replace(`/${moduleType}?${sp.toString()}`);
    const next = { ...activeFilters };
    if (tagFilter.trim()) next.tag = tagFilter.trim();
    else delete next.tag;
    setActiveFilters(next);
  }, [tagFilter, activeFilters, moduleType, router, searchParams]);

  // Client-side text search over the loaded rows (title + field values).
  const visible = useMemo(() => {
    if (!query.trim()) return data;
    const q = query.trim().toLowerCase();
    return data.filter((row) => {
      const haystack = [
        String(row.title ?? ""),
        ...listColumns.map((c) => String(row[c.key] ?? "")),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [data, query, listColumns]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {label.plural}
        </h1>
        {renderCreate ? renderCreate(() => {}) : null}
      </div>

      {/* Search */}
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${label.plural.toLowerCase()}…`}
          aria-label={`Search ${label.plural.toLowerCase()}`}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="entity-search"
        />
      </div>

      {/* Filter chips */}
      {/* Sort */}
      {sortKeys.length > 0 && (
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Sort by</label>
            <select
              value={initialSort ?? ""}
              onChange={(e) => applySort(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="sort-select"
            >
              {sortKeys.map((key) => (
                <option key={key} value={key}>
                  {labelForSort(key)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() =>
              applySort(initialSort ?? sortKeys[0]!)
            }
            className="flex h-9 items-center rounded-md bg-secondary px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Toggle sort direction"
          >
            {initialSortDirection === "asc" ? "↑" : "↓"}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        {filterKeys.map((key) => {
          const field = fieldMap.get(key);
          if (!field || field.kind !== "enum" || !field.enumValues) return null;
          return (
            <div key={key} className="space-y-1">
              <label className="text-xs text-muted-foreground">
                {field.label}
              </label>
              <select
                value={(activeFilters[key] as string) ?? "__all__"}
                onChange={(e) => applyFilter(key, e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid={`filter-${key}`}
              >
                <option value="__all__">All</option>
                {field.enumValues.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          );
        })}

        {showTagFilter && (
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Tag</label>
              <input
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyTagFilter();
                }}
                placeholder="Filter by tag…"
                className="w-40 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="tag-filter-input"
              />
            </div>
            <button
              type="button"
              onClick={applyTagFilter}
              className="flex h-9 items-center rounded-md bg-secondary px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {loadError && <p className="text-destructive">{loadError}</p>}

      {/* Rows */}
      {visible.length === 0 && !loadError ? (
        <p className="py-8 text-center text-muted-foreground">
          No {label.plural.toLowerCase()} yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((row) => (
            <li key={row.id as string} data-testid="entity-row">
              <Link
                href={`/${moduleType}/${row.id}`}
                className="flex flex-col gap-1 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="entity-link"
              >
                <span className="font-medium text-primary hover:underline">
                  {String(row.title ?? "Untitled")}
                </span>
                {/* Wide: meta columns on the right / narrow: stacked below */}
                <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {listColumns
                    .filter((c) => c.key !== "title")
                    .map((c) => (
                      <span key={c.key}>
                        <span className="mr-1 text-xs sm:hidden">
                          {c.label}:
                        </span>
                        {formatFieldValue(row[c.key], c)}
                      </span>
                    ))}
                  <span className="text-xs">
                    Updated{" "}
                    {row.updatedAt
                      ? new Date(
                          row.updatedAt as string | number,
                        ).toLocaleDateString()
                      : "—"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="flex justify-center py-4">
        {cursor ? (
          <button
            type="button"
            onClick={loadMore}
            disabled={isLoadingMore}
            className="text-sm text-muted-foreground hover:text-foreground"
            data-testid="load-more-btn"
          >
            {isLoadingMore ? "Loading…" : "Load more"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
