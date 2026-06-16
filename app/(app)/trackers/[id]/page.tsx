import Link from "next/link";
import { notFound } from "next/navigation";
import { AddEntryForm } from "@/components/trackers/AddEntryForm";
import { EntryHistoryList } from "@/components/trackers/EntryHistoryList";
import { UpdateTrackerForm } from "@/components/trackers/UpdateTrackerForm";
import { getTrackerWithEntries } from "@/lib/actions/trackers";
import { loadMentionUsers } from "@/lib/users/mention-users";

export default async function TrackerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, mentionUsers] = await Promise.all([getTrackerWithEntries(id), loadMentionUsers()]);
  if (!data) {
    notFound();
  }

  const { tracker, entries } = data;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <Link
          href="/trackers"
          className="text-sm text-text-muted transition-colors hover:text-text"
        >
          ← Back to trackers
        </Link>
        <div>
          <h1 className="font-serif text-2xl text-text">{tracker.name}</h1>
          {tracker.unit ? (
            <p className="mt-1 text-sm text-text-muted">Unit: {tracker.unit}</p>
          ) : null}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
          <h2 className="text-lg font-medium text-text">Tracker settings</h2>
          <div className="mt-4">
            <UpdateTrackerForm tracker={tracker} />
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
          <h2 className="text-lg font-medium text-text">Add entry</h2>
          <p className="mt-1 text-sm text-text-muted">
            Record a value with an optional note and date.
          </p>
          <div className="mt-4">
            <AddEntryForm trackerId={tracker.id} users={mentionUsers} />
          </div>
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-text">History</h2>
        <EntryHistoryList tracker={tracker} entries={entries} />
      </section>
    </div>
  );
}
