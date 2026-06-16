import Link from "next/link";
import { markAllRead, markRead, openNotification } from "@/lib/actions/notifications";
import type { NotificationRow } from "@/lib/notifications/queries";
import { FormSubmitButton } from "@/components/ui/FormSubmitButton";

function formatWhen(date: Date): string {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NotificationList({ items }: { items: NotificationRow[] }) {
  const unreadCount = items.filter((item) => !item.readAt).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-muted">
          {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        </p>
        {unreadCount > 0 ? (
          <form action={markAllRead}>
            <FormSubmitButton
              pendingLabel="Marking…"
              className="inline-flex h-9 min-h-9 items-center justify-center rounded-md bg-transparent px-3 text-sm font-medium text-text transition-colors hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
            >
              Mark all read
            </FormSubmitButton>
          </form>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-muted shadow-card">
          No notifications yet. Household activity will show up here.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-card">
          {items.map((item) => (
            <li key={item.id}>
              <NotificationItem item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotificationItem({ item }: { item: NotificationRow }) {
  const unread = !item.readAt;
  const content = (
    <>
      <div className="flex items-start gap-2">
        {unread ? (
          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />
        ) : (
          <span className="mt-2 h-2 w-2 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p
            className={`text-sm leading-relaxed ${unread ? "font-medium text-text" : "text-text"}`}
          >
            {item.summary}
          </p>
          <p className="mt-1 text-xs text-text-muted">{formatWhen(item.createdAt)}</p>
        </div>
      </div>
    </>
  );

  if (item.href) {
    return (
      <form action={openNotification.bind(null, item.id)} className="block w-full">
        <FormSubmitButton
          pendingLabel="Opening…"
          className="w-full px-4 py-3 text-left transition-colors hover:bg-accent-soft focus-visible:bg-accent-soft focus-visible:outline-none disabled:opacity-50"
        >
          {content}
        </FormSubmitButton>
      </form>
    );
  }

  return (
    <form action={markRead} className="block w-full">
      <input type="hidden" name="id" value={item.id} />
      <FormSubmitButton
        pendingLabel="…"
        className="w-full px-4 py-3 text-left transition-colors hover:bg-accent-soft focus-visible:bg-accent-soft focus-visible:outline-none disabled:opacity-50"
      >
        {content}
      </FormSubmitButton>
    </form>
  );
}

export function SinceLastVisitList({ items }: { items: NotificationRow[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card md:col-span-2">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-medium text-text">Since you last visited</h2>
        <Link
          href="/notifications"
          className="text-sm font-medium text-accent hover:text-accent/80 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          View all
        </Link>
      </div>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="border-b border-border pb-3 last:border-b-0 last:pb-0">
            <form action={openNotification.bind(null, item.id)}>
              <FormSubmitButton
                pendingLabel="Opening…"
                className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
              >
                <p
                  className={`text-sm leading-relaxed ${item.readAt ? "text-text" : "font-medium text-text"}`}
                >
                  {item.summary}
                </p>
                <p className="mt-1 text-xs text-text-muted">{formatWhen(item.createdAt)}</p>
              </FormSubmitButton>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
