import Link from "next/link";
import {
  clearReadNotifications,
  deleteNotification,
  markAllRead,
  markRead,
  openNotification,
} from "@/lib/actions/notifications";
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

function sizeButtonClass(className = ""): string {
  return [
    "inline-flex h-9 min-h-9 items-center justify-center rounded-sm bg-transparent px-3",
    "text-sm font-medium text-text transition-colors hover:bg-accent-soft",
    "focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50",
    className,
  ].join(" ");
}

export function NotificationList({ items }: { items: NotificationRow[] }) {
  const unreadCount = items.filter((item) => !item.readAt).length;
  const readCount = items.length - unreadCount;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-muted">
          {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        </p>
        <div className="flex items-center gap-2">
          {readCount > 0 ? (
            <form action={clearReadNotifications}>
              <FormSubmitButton
                pendingLabel="Clearing…"
                className={sizeButtonClass("text-text-muted hover:text-accent")}
              >
                Clear read
              </FormSubmitButton>
            </form>
          ) : null}
          {unreadCount > 0 ? (
            <form action={markAllRead}>
              <FormSubmitButton pendingLabel="Marking…" className={sizeButtonClass()}>
                Mark all read
              </FormSubmitButton>
            </form>
          ) : null}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="border-t border-border pt-6 text-center text-sm text-text-muted">
          No notifications yet. Household activity will show up here.
        </p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {items.map((item) => (
            <NotificationItem key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NotificationItem({ item }: { item: NotificationRow }) {
  const unread = !item.readAt;
  const content = (
    <div className="flex items-start gap-2">
      <span
        className={`mt-2 h-2 w-2 shrink-0 rounded-full ${unread ? "bg-accent" : "bg-transparent"}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className={`text-sm leading-relaxed ${unread ? "font-medium text-text" : "text-text"}`}>
          {item.summary}
        </p>
        <p className="mt-1 text-xs text-text-muted">{formatWhen(item.createdAt)}</p>
      </div>
    </div>
  );

  const openForm = item.href ? (
    <form action={openNotification.bind(null, item.id)} className="min-w-0 flex-1">
      <FormSubmitButton
        pendingLabel="Opening…"
        className="w-full px-4 py-3 text-left transition-colors hover:bg-accent-soft focus-visible:bg-accent-soft focus-visible:outline-none disabled:opacity-50"
      >
        {content}
      </FormSubmitButton>
    </form>
  ) : (
    <form action={markRead} className="min-w-0 flex-1">
      <input type="hidden" name="id" value={item.id} />
      <FormSubmitButton
        pendingLabel="…"
        className="w-full px-4 py-3 text-left transition-colors hover:bg-accent-soft focus-visible:bg-accent-soft focus-visible:outline-none disabled:opacity-50"
      >
        {content}
      </FormSubmitButton>
    </form>
  );

  return (
    <li>
      <div className="flex items-start">
        {openForm}
        <form action={deleteNotification}>
          <input type="hidden" name="id" value={item.id} />
          <FormSubmitButton
            pendingLabel="…"
            aria-label="Delete notification"
            className="flex h-full items-center justify-center px-3 text-text-muted transition-colors hover:text-accent focus-visible:outline-none disabled:opacity-50"
          >
            <TrashIcon />
          </FormSubmitButton>
        </form>
      </div>
    </li>
  );
}

export function SinceLastVisitList({ items }: { items: NotificationRow[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="border-t border-border pt-4 md:col-span-2">
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

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}
