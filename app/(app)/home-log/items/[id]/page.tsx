import { notFound } from "next/navigation";
import { getHomeItemById } from "@/lib/actions/home";
import { HomeItemDetailView } from "@/components/home/HomeItemDetail";
import { loadMentionUsers } from "@/lib/users/mention-users";

export default async function HomeItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [item, mentionUsers] = await Promise.all([getHomeItemById(id), loadMentionUsers()]);

  if (!item) {
    notFound();
  }

  return <HomeItemDetailView item={item} users={mentionUsers} />;
}
