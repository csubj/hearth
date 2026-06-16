"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { InventoryTag } from "@/db/schema/inventory";

export function InventoryFilters({
  tags,
  itemTypes,
  currentQ,
  currentTag,
  currentType,
}: {
  tags: InventoryTag[];
  itemTypes: string[];
  currentQ?: string;
  currentTag?: string;
  currentType?: string;
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
    router.push(`/inventory?${params.toString()}`);
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-card">
      <div>
        <label htmlFor="inventory-search" className="block text-sm font-medium text-text">
          Search
        </label>
        <input
          id="inventory-search"
          type="search"
          defaultValue={currentQ ?? ""}
          placeholder="Name, model, serial, location…"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          onChange={(event) => updateParam("q", event.target.value)}
        />
      </div>

      {itemTypes.length > 0 ? (
        <div>
          <span className="block text-sm font-medium text-text">Type</span>
          <div className="mt-2 flex flex-wrap gap-2">
            <FilterChip
              label="All types"
              active={!currentType}
              onClick={() => updateParam("type", "")}
            />
            {itemTypes.map((type) => (
              <FilterChip
                key={type}
                label={type}
                active={currentType === type}
                onClick={() => updateParam("type", type)}
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

      {(currentQ || currentTag || currentType) && (
        <Link href="/inventory" className="text-sm text-accent hover:text-accent/80">
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
