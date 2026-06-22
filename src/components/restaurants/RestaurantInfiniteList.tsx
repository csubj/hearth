"use client";

import { useCallback } from "react";
import { RestaurantCard } from "@/components/restaurants/RestaurantCard";
import { InfiniteList } from "@/components/ui/InfiniteList";
import { listRestaurantsPage, type RestaurantListItem } from "@/lib/actions/restaurants";

export function RestaurantInfiniteList({
  initialItems,
  initialNextOffset,
  searchParams,
}: {
  initialItems: RestaurantListItem[];
  initialNextOffset: number | null;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const loadMore = useCallback(
    (offset: number) => listRestaurantsPage(searchParams, offset),
    [searchParams],
  );

  return (
    <InfiniteList
      initialItems={initialItems}
      initialNextOffset={initialNextOffset}
      loadMore={loadMore}
      renderItem={(restaurant) => <RestaurantCard restaurant={restaurant} />}
      emptyState={
        <p className="rounded-lg border border-dashed border-border bg-surface p-6 text-center text-sm text-text-muted">
          No restaurants yet. Use <span className="font-medium text-text">Add restaurant</span>{" "}
          above to get started.
        </p>
      }
    />
  );
}
