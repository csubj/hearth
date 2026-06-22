"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ProjectTag } from "@/db/schema/projects";

export function ProjectFilters({
  tags,
  currentQ,
  currentTag,
  currentSort,
  currentStatus,
}: {
  tags: ProjectTag[];
  currentQ?: string;
  currentTag?: string;
  currentSort?: string;
  currentStatus?: string;
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
    router.push(`/projects?${params.toString()}`);
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-card">
      <div>
        <label htmlFor="project-search" className="block text-sm font-medium text-text">
          Search
        </label>
        <input
          id="project-search"
          type="search"
          defaultValue={currentQ ?? ""}
          placeholder="Title, notes, components, tags…"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          onChange={(event) => updateParam("q", event.target.value)}
        />
      </div>

      <div>
        <span className="block text-sm font-medium text-text">Status</span>
        <div className="mt-2 flex flex-wrap gap-2">
          <FilterChip
            label="All"
            active={!currentStatus || currentStatus === "all"}
            onClick={() => updateParam("status", "")}
          />
          <FilterChip
            label="In progress"
            active={currentStatus === "in_progress"}
            onClick={() => updateParam("status", "in_progress")}
          />
          <FilterChip
            label="Ideas"
            active={currentStatus === "idea"}
            onClick={() => updateParam("status", "idea")}
          />
          <FilterChip
            label="Done"
            active={currentStatus === "done"}
            onClick={() => updateParam("status", "done")}
          />
        </div>
      </div>

      <div>
        <span className="block text-sm font-medium text-text">Sort</span>
        <div className="mt-2 flex flex-wrap gap-2">
          <FilterChip
            label="Updated"
            active={!currentSort || currentSort === "updated_desc"}
            onClick={() => updateParam("sort", "updated_desc")}
          />
          <FilterChip
            label="Priority"
            active={currentSort === "priority_desc"}
            onClick={() => updateParam("sort", "priority_desc")}
          />
          <FilterChip
            label="Cost"
            active={currentSort === "cost_desc"}
            onClick={() => updateParam("sort", "cost_desc")}
          />
        </div>
      </div>

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

      {(currentQ ||
        currentTag ||
        (currentStatus && currentStatus !== "all") ||
        (currentSort && currentSort !== "updated_desc")) && (
        <Link href="/projects" className="text-sm text-accent hover:text-accent/80">
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
