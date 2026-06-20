import { notFound } from "next/navigation";
import { getHomeSpaceById } from "@/lib/actions/home";
import { HomeSpaceDetail } from "@/components/home/HomeSpaceDetail";
import { HomeSpaceCreateForm } from "@/components/home/HomeSpaceCreateForm";
import { loadMentionUsers } from "@/lib/users/mention-users";

export default async function HomeSpacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [space, mentionUsers] = await Promise.all([getHomeSpaceById(id), loadMentionUsers()]);

  if (!space) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <HomeSpaceDetail space={space} users={mentionUsers} />

      <section>
        <HomeSpaceCreateForm
          parentSpace={{
            id: space.id,
            name: space.name,
            kind: space.kind,
            sortOrder: space.sortOrder,
          }}
          defaultKind="room"
        />
      </section>
    </div>
  );
}
