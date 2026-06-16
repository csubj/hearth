import { notFound } from "next/navigation";
import { RestaurantDetail } from "@/components/restaurants/RestaurantDetail";
import { getRestaurantById } from "@/lib/actions/restaurants";
import { loadMentionUsers } from "@/lib/users/mention-users";

export default async function RestaurantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [restaurant, mentionUsers] = await Promise.all([getRestaurantById(id), loadMentionUsers()]);

  if (!restaurant) {
    notFound();
  }

  return <RestaurantDetail restaurant={restaurant} users={mentionUsers} />;
}
