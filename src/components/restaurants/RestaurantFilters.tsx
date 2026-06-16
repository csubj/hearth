import Link from "next/link";
import type { RestaurantListFilters } from "@/lib/actions/restaurants";

const statusOptions = [
  { value: "all", label: "All" },
  { value: "want_to_try", label: "Want to try" },
  { value: "visited", label: "Visited" },
] as const;

const sortOptions = [
  { value: "created_at", label: "Date added" },
  { value: "rating", label: "Rating" },
] as const;

function filterHref(filters: RestaurantListFilters, patch: Partial<RestaurantListFilters>): string {
  const status = patch.status ?? filters.status ?? "all";
  const sort = patch.sort ?? filters.sort ?? "created_at";
  const params = new URLSearchParams();
  if (status !== "all") {
    params.set("status", status);
  }
  if (sort !== "created_at") {
    params.set("sort", sort);
  }
  const query = params.toString();
  return query ? `/restaurants?${query}` : "/restaurants";
}

function chipClass(active: boolean): string {
  return active
    ? "border-accent bg-accent-soft text-accent"
    : "border-border bg-surface text-text-muted hover:bg-accent-soft hover:text-text";
}

export function RestaurantFilters({ filters }: { filters: RestaurantListFilters }) {
  const status = filters.status ?? "all";
  const sort = filters.sort ?? "created_at";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {statusOptions.map((option) => (
          <Link
            key={option.value}
            href={filterHref(filters, { status: option.value })}
            className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${chipClass(status === option.value)}`}
          >
            {option.label}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-text-muted">Sort by</span>
        {sortOptions.map((option) => (
          <Link
            key={option.value}
            href={filterHref(filters, { sort: option.value })}
            className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${chipClass(sort === option.value)}`}
          >
            {option.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
