import { notFound } from "next/navigation";
import { getHomeSpaceById } from "@/lib/actions/home";
import { CreateDialog } from "@/components/ui/CreateDialog";
import { HomeSpaceDetail } from "@/components/home/HomeSpaceDetail";
import { HomeSpaceCreateForm } from "@/components/home/HomeSpaceCreateForm";
import { loadMentionUsers } from "@/lib/users/mention-users";

export default async function HomeSpacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [space, mentionUsers] = await Promise.all([getHomeSpaceById(id), loadMentionUsers()]);

  if (!space) {
    notFound();
  }

  const parentSpace = {
    id: space.id,
    name: space.name,
    kind: space.kind,
    sortOrder: space.sortOrder,
  };

  return (
    <div className="space-y-8">
      <HomeSpaceDetail
        space={space}
        users={mentionUsers}
        addSpaceTrigger={
          <CreateDialog
            triggerLabel="Add space"
            triggerVariant="secondary"
            triggerClassName="h-9 min-h-9 px-3 text-xs"
            title={`Add a space inside ${space.name}`}
            description="Add a structure, room, or area within this space."
          >
            <HomeSpaceCreateForm parentSpace={parentSpace} defaultKind="room" />
          </CreateDialog>
        }
      />
    </div>
  );
}
