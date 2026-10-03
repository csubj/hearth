import type { RestaurantStatus } from "@/db/schema";

export function RestaurantStatusChip({ status }: { status: RestaurantStatus }) {
  if (status === "want_to_try") {
    return (
      <span className="inline-flex items-center border border-accent px-2 py-0.5 text-xs uppercase tracking-[0.1em] text-accent">
        Want to try
      </span>
    );
  }

  return (
    <span className="inline-flex items-center border border-border px-2 py-0.5 text-xs uppercase tracking-[0.1em] text-text-muted">
      Visited
    </span>
  );
}