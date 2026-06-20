import Link from "next/link";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { BrowseMenu } from "@/components/BrowseMenu";
import { displayName, touchLastSeen, validateRequest } from "@/lib/auth/session";
import { processMetricReminders } from "@/lib/metrics/reminders";
import { getPreviousLastSeenAt, getUnreadNotificationCount } from "@/lib/notifications/queries";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/reminders", label: "Reminders" },
] as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, session } = await validateRequest();
  if (!user || !session) {
    redirect("/login");
  }

  await getPreviousLastSeenAt(user.id);
  await touchLastSeen(user.id);

  try {
    await processMetricReminders();
    const { processInventoryMaintenanceReminders } = await import("@/lib/inventory/reminders");
    const { processMaintenanceLogReminders } = await import("@/lib/maintenance/reminders");
    await processInventoryMaintenanceReminders();
    await processMaintenanceLogReminders();
  } catch {
    // Reminder processing should not block page render.
  }

  let unreadCount = 0;
  try {
    unreadCount = await getUnreadNotificationCount(user.id);
  } catch {
    unreadCount = 0;
  }

  const navUser = {
    displayName: displayName(user),
    role: user.role,
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-serif text-2xl text-text">
              hearth
            </Link>
            <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
              <Link
                href="/"
                className="rounded-md px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-accent-soft hover:text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              >
                Home
              </Link>
              <BrowseMenu />
              {navLinks.slice(1).map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-md px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-accent-soft hover:text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <AppNav user={navUser} unreadCount={unreadCount} />
        </div>
        <nav
          className="flex gap-1 overflow-x-auto border-t border-border px-4 py-2 md:hidden"
          aria-label="Main mobile"
        >
          <Link
            href="/"
            className="shrink-0 rounded-md px-3 py-2 text-sm font-medium text-text-muted hover:bg-accent-soft hover:text-text"
          >
            Home
          </Link>
          <Link
            href="/browse"
            className="shrink-0 rounded-md px-3 py-2 text-sm font-medium text-text-muted hover:bg-accent-soft hover:text-text"
          >
            Browse
          </Link>
          {navLinks.slice(1).map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="shrink-0 rounded-md px-3 py-2 text-sm font-medium text-text-muted hover:bg-accent-soft hover:text-text"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">{children}</main>
    </div>
  );
}
