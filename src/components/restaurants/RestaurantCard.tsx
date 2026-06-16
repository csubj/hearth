import Link from "next/link";
import type { RestaurantListItem } from "@/lib/actions/restaurants";
import { RestaurantStatusChip } from "@/components/restaurants/RestaurantStatusChip";
import { StarRating } from "@/components/restaurants/StarRating";

function locationLine(restaurant: RestaurantListItem): string | null {
  return restaurant.neighborhood ?? restaurant.address ?? null;
}

export function RestaurantCard({ restaurant }: { restaurant: RestaurantListItem }) {
  const location = locationLine(restaurant);

  return (
    <Link
      href={`/restaurants/${restaurant.id}`}
      className="block rounded-lg border border-border bg-surface p-4 shadow-card transition-colors hover:border-accent/40 hover:bg-accent-soft/30 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-medium text-text">{restaurant.name}</h3>
          {location ? <p className="mt-0.5 text-sm text-text-muted">{location}</p> : null}
          <p className="mt-0.5 text-xs text-text-muted">Added by {restaurant.addedByName}</p>
        </div>
        <RestaurantStatusChip status={restaurant.status} />
      </div>
      {restaurant.notes ? (
        <p className="mt-2 line-clamp-2 text-sm text-text-muted">{restaurant.notes}</p>
      ) : null}
      {restaurant.status === "visited" ? (
        <div className="mt-2">
          <StarRating rating={restaurant.rating} />
        </div>
      ) : null}
    </Link>
  );
}
