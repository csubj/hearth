import { CreateRestaurantForm } from "@/components/restaurants/CreateRestaurantForm";
import { RestaurantFilters } from "@/components/restaurants/RestaurantFilters";
import { RestaurantList } from "@/components/restaurants/RestaurantList";
import {
  listRestaurantNeighborhoods,
  listRestaurants,
  type RestaurantListFilters,
} from "@/lib/actions/restaurants";
import { loadMentionUsers } from "@/lib/users/mention-users";

function parseFilters(
  searchParams: Record<string, string | string[] | undefined>,
): RestaurantListFilters {
  const statusParam = typeof searchParams.status === "string" ? searchParams.status : "all";
  const sortParam = typeof searchParams.sort === "string" ? searchParams.sort : "created_at";
  const neighborhoodParam =
    typeof searchParams.neighborhood === "string" ? searchParams.neighborhood : undefined;
  const addedByParam = typeof searchParams.addedBy === "string" ? searchParams.addedBy : undefined;

  return {
    status: statusParam === "want_to_try" || statusParam === "visited" ? statusParam : "all",
    sort: sortParam === "rating" ? "rating" : "created_at",
    neighborhood: neighborhoodParam || undefined,
    addedBy: addedByParam || undefined,
  };
}

export default async function RestaurantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const filters = parseFilters(resolvedSearchParams);
  const [items, neighborhoods, mentionUsers] = await Promise.all([
    listRestaurants(resolvedSearchParams),
    listRestaurantNeighborhoods(),
    loadMentionUsers(),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-2xl text-text">Restaurants</h1>
        <p className="mt-1 text-sm text-text-muted">Places to try and spots you&apos;ve loved.</p>
      </header>
      <CreateRestaurantForm users={mentionUsers} />
      <RestaurantFilters filters={filters} neighborhoods={neighborhoods} users={mentionUsers} />
      <RestaurantList restaurants={items} />
    </div>
  );
}
