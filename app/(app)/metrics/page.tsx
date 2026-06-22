import { CreateDialog } from "@/components/ui/CreateDialog";
import { CreateMetricForm } from "@/components/metrics/CreateMetricForm";
import { MetricsList } from "@/components/metrics/MetricsList";
import { listMetricsPage } from "@/lib/actions/metrics-list";
import { loadMentionUsers } from "@/lib/users/mention-users";

export default async function MetricsPage() {
  const [page, mentionUsers] = await Promise.all([listMetricsPage(), loadMentionUsers()]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-text">Metrics</h1>
          <p className="mt-1 text-sm text-text-muted">
            Ongoing measurements and observations for the household.
          </p>
        </div>
        <CreateDialog
          triggerLabel="New metric"
          title="New metric"
          description="Track an ongoing measurement or observation."
        >
          <CreateMetricForm users={mentionUsers} />
        </CreateDialog>
      </header>

      <section className="space-y-3">
        <MetricsList initialItems={page.items} initialNextOffset={page.nextOffset} />
      </section>
    </div>
  );
}
