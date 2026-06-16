import { validateRequest } from "@/lib/auth/session";
import { listNotifications } from "@/lib/notifications/queries";
import { NotificationList } from "@/components/notifications/NotificationList";

export default async function NotificationsPage() {
  const { user } = await validateRequest();
  if (!user) {
    return null;
  }

  const items = await listNotifications(user.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="font-serif text-2xl text-text">Notifications</h1>
        <p className="mt-1 text-sm text-text-muted">Household activity and mentions.</p>
      </header>
      <NotificationList items={items} />
    </div>
  );
}
