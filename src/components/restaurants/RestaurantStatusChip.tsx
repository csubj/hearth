import type { RestaurantStatus } from "@/db/schema";

export function RestaurantStatusChip({ status }: { status: RestaurantStatus }) {
  if (status === "want_to_try") {
    return (
      <span className="inline-flex rounded-full border border-accent px-2 py-0.5 text-xs font-medium text-accent">
        Want to try
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-border/60 px-2 py-0.5 text-xs font-medium text-text-muted">
      Visited
    </span>
  );
}
