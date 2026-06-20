"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { MaintenanceLogTag } from "@/db/schema/maintenance";

export function MaintenanceFilters({
  tags,
  categories,
  currentQ,
  currentTag,
  currentCategory,
  currentSort,
}: {
  tags: MaintenanceLogTag[];
  categories: string[];
  currentQ?: string;
  currentTag?: string;
  currentCategory?: string;
  currentSort?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/maintenance?${params.toString()}`);
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-card">
      <div>
        <label htmlFor="maintenance-search" className="block text-sm font-medium text-text">
          Search
        </label>
        <input
          id="maintenance-search"
          type="search"
          defaultValue={currentQ ?? ""}
          placeholder="Title, company, notes, category…"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          onChange={(event) => updateParam("q", event.target.value)}
        />
      </div>

      <div>
        <label htmlFor="maintenance-sort" className="block text-sm font-medium text-text">
          Sort
        </label>
        <select
          id="maintenance-sort"
          defaultValue={currentSort ?? "updated_desc"}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          onChange={(event) => updateParam("sort", event.target.value)}
        >
          <option value="updated_desc">Recently updated</option>
          <option value="started_desc">Recently started</option>
          <option value="completed_desc">Recently completed</option>
          <option value="cost_desc">Highest cost</option>
        </select>
      </div>

      {categories.length > 0 ? (
        <div>
          <span className="block text-sm font-medium text-text">Category</span>
          <div className="mt-2 flex flex-wrap gap-2">
            <FilterChip
              label="All categories"
              active={!currentCategory}
              onClick={() => updateParam("category", "")}
            />
            {categories.map((category) => (
              <FilterChip
                key={category}
                label={category}
                active={currentCategory?.toLowerCase() === category.toLowerCase()}
                onClick={() => updateParam("category", category)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {tags.length > 0 ? (
        <div>
          <span className="block text-sm font-medium text-text">Tags</span>
          <div className="mt-2 flex flex-wrap gap-2">
            <FilterChip
              label="All tags"
              active={!currentTag}
              onClick={() => updateParam("tag", "")}
            />
            {tags.map((tag) => (
              <FilterChip
                key={tag.id}
                label={tag.name}
                active={currentTag?.toLowerCase() === tag.name.toLowerCase()}
                onClick={() => updateParam("tag", tag.name)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {(currentQ || currentTag || currentCategory) && (
        <Link href="/maintenance" className="text-sm text-accent hover:text-accent/80">
          Clear filters
        </Link>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-sm transition-colors ${
        active
          ? "bg-accent text-white"
          : "border border-border bg-background text-text-muted hover:bg-accent-soft hover:text-text"
      }`}
    >
      {label}
    </button>
  );
}
