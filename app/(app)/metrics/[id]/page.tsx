import Link from "next/link";
import { notFound } from "next/navigation";
import { AddEntryForm } from "@/components/metrics/AddEntryForm";
import { EntryHistoryList } from "@/components/metrics/EntryHistoryList";
import { isNumericMetric } from "@/components/metrics/chart";
import { MetricChart } from "@/components/metrics/MetricChart";
import { UpdateMetricForm } from "@/components/metrics/UpdateMetricForm";
import { getMetricWithEntries } from "@/lib/actions/metrics";
import { loadMentionUsers } from "@/lib/users/mention-users";

export default async function MetricDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, mentionUsers] = await Promise.all([getMetricWithEntries(id), loadMentionUsers()]);
  if (!data) {
    notFound();
  }

  const { metric, entries } = data;
  const showChart = isNumericMetric(entries);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <Link
          href="/metrics"
          className="text-sm text-text-muted transition-colors hover:text-text"
        >
          ← Back to metrics
        </Link>
        <div>
          <h1 className="font-serif text-2xl text-text">{metric.name}</h1>
          {metric.unit ? (
            <p className="mt-1 text-sm text-text-muted">Unit: {metric.unit}</p>
          ) : null}
        </div>
      </header>

      {showChart ? <MetricChart unit={metric.unit} entries={entries} /> : null}

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-text">History</h2>
        <EntryHistoryList metric={metric} entries={entries} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
          <h2 className="text-lg font-medium text-text">Metric settings</h2>
          <div className="mt-4">
            <UpdateMetricForm metric={metric} />
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
          <h2 className="text-lg font-medium text-text">Add entry</h2>
          <p className="mt-1 text-sm text-text-muted">
            Record a value with an optional note and date.
          </p>
          <div className="mt-4">
            <AddEntryForm metricId={metric.id} users={mentionUsers} />
          </div>
        </section>
      </div>
    </div>
  );
}
