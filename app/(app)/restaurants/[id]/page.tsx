import { notFound } from "next/navigation";
import { RestaurantDetail } from "@/components/restaurants/RestaurantDetail";
import { getRestaurantById } from "@/lib/actions/restaurants";

export default async function RestaurantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const restaurant = await getRestaurantById(id);

  if (!restaurant) {
    notFound();
  }

  return <RestaurantDetail restaurant={restaurant} />;
}
