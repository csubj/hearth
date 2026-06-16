import { desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { streamEntries, users } from "@/db/schema";
import { StreamCaptureForm } from "@/components/StreamCaptureForm";
import { StreamEntryList, type StreamEntryWithAuthor } from "@/components/StreamEntryList";

async function loadMentionUsers() {
  const rows = await getDb()
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
    })
    .from(users)
    .where(isNull(users.disabledAt));

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.displayName,
  }));
}

async function loadStreamEntries(): Promise<{
  open: StreamEntryWithAuthor[];
  done: StreamEntryWithAuthor[];
}> {
  const rows = await getDb()
    .select({
      entry: streamEntries,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
    })
    .from(streamEntries)
    .innerJoin(users, eq(streamEntries.createdByUserId, users.id))
    .orderBy(desc(streamEntries.isPinned), desc(streamEntries.createdAt));

  const open: StreamEntryWithAuthor[] = [];
  const done: StreamEntryWithAuthor[] = [];

  for (const row of rows) {
    const item: StreamEntryWithAuthor = {
      id: row.entry.id,
      body: row.entry.body,
      isPinned: row.entry.isPinned,
      doneAt: row.entry.doneAt,
      roughWhen: row.entry.roughWhen,
      createdAt: row.entry.createdAt,
      authorName: row.authorDisplayName ?? row.authorUsername,
    };

    if (row.entry.doneAt) {
      done.push(item);
    } else {
      open.push(item);
    }
  }

  done.sort((a, b) => (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0));

  return { open, done };
}

export default async function StreamPage() {
  const [mentionUsers, { open, done }] = await Promise.all([
    loadMentionUsers(),
    loadStreamEntries(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="font-serif text-2xl text-text">Stream</h1>
        <p className="mt-1 text-sm text-text-muted">Quick notes and reminders for the household.</p>
      </header>
      <StreamCaptureForm users={mentionUsers} />
      <StreamEntryList openEntries={open} doneEntries={done} />
    </div>
  );
}
