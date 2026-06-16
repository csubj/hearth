import { desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/db";
import { streamEntries, users } from "@/db/schema";

async function loadHomeStreamEntries() {
  const rows = await getDb()
    .select({
      id: streamEntries.id,
      body: streamEntries.body,
      isPinned: streamEntries.isPinned,
      roughWhen: streamEntries.roughWhen,
      authorName: users.displayName,
      authorUsername: users.username,
    })
    .from(streamEntries)
    .innerJoin(users, eq(streamEntries.createdByUserId, users.id))
    .where(isNull(streamEntries.doneAt))
    .orderBy(desc(streamEntries.isPinned), desc(streamEntries.createdAt))
    .limit(5);

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    isPinned: row.isPinned,
    roughWhen: row.roughWhen,
    authorName: row.authorName ?? row.authorUsername,
  }));
}

export async function StreamSection() {
  let entries: Awaited<ReturnType<typeof loadHomeStreamEntries>> = [];

  try {
    entries = await loadHomeStreamEntries();
  } catch {
    // Table may not exist until migration checkpoint
    entries = [];
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-medium text-text">Stream</h2>
        <Link
          href="/stream"
          className="text-sm font-medium text-accent hover:text-accent/80 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          View all
        </Link>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-text-muted">
          No open notes yet.{" "}
          <Link href="/stream" className="text-accent hover:text-accent/80">
            Add one
          </Link>
        </p>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="border-b border-border pb-3 last:border-b-0 last:pb-0">
              <p className="text-base leading-relaxed text-text">{entry.body}</p>
              <p className="mt-1 text-sm text-text-muted">
                {entry.authorName}
                {entry.roughWhen ? (
                  <>
                    <span aria-hidden="true"> · </span>
                    {entry.roughWhen}
                  </>
                ) : null}
                {entry.isPinned ? (
                  <>
                    <span aria-hidden="true"> · </span>
                    <span className="text-accent">Pinned</span>
                  </>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
