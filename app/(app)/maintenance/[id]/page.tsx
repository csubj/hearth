import { notFound } from "next/navigation";
import { MaintenanceDetailView } from "@/components/maintenance/MaintenanceDetail";
import { getMaintenanceLogById } from "@/lib/actions/maintenance";
import { loadMentionUsers } from "@/lib/users/mention-users";

export default async function MaintenanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [log, mentionUsers] = await Promise.all([getMaintenanceLogById(id), loadMentionUsers()]);

  if (!log) {
    notFound();
  }

  return <MaintenanceDetailView log={log} users={mentionUsers} />;
}
