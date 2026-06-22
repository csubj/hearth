"use client";

import { useCallback } from "react";
import { MetricCard } from "@/components/metrics/MetricCard";
import { InfiniteList } from "@/components/ui/InfiniteList";
import { listMetricsPage, type MetricListPageItem } from "@/lib/actions/metrics-list";

export function MetricsList({
  initialItems,
  initialNextOffset,
}: {
  initialItems: MetricListPageItem[];
  initialNextOffset: number | null;
}) {
  const loadMore = useCallback((offset: number) => listMetricsPage(offset), []);

  return (
    <InfiniteList
      initialItems={initialItems}
      initialNextOffset={initialNextOffset}
      loadMore={loadMore}
      renderItem={(item) => <MetricCard item={item} />}
      emptyState={
        <p className="text-sm text-text-muted">
          No metrics yet. Use <span className="font-medium text-text">New metric</span> above to get
          started.
        </p>
      }
    />
  );
}
