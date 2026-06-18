import { notFound } from "next/navigation";
import { InventoryDetailView } from "@/components/inventory/InventoryDetail";
import { getInventoryItemById } from "@/lib/actions/inventory";
import { loadMentionUsers } from "@/lib/users/mention-users";

export default async function InventoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [item, mentionUsers] = await Promise.all([getInventoryItemById(id), loadMentionUsers()]);

  if (!item) {
    notFound();
  }

  return <InventoryDetailView item={item} users={mentionUsers} />;
}
