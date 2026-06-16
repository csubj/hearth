import type { Restaurant } from "@/db/schema";
import { RestaurantCard } from "@/components/restaurants/RestaurantCard";

export function RestaurantList({ restaurants }: { restaurants: Restaurant[] }) {
  if (restaurants.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-surface p-6 text-center text-sm text-text-muted">
        No restaurants yet. Add one above to get started.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {restaurants.map((restaurant) => (
        <li key={restaurant.id}>
          <RestaurantCard restaurant={restaurant} />
        </li>
      ))}
    </ul>
  );
}
