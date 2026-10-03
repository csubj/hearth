import Link from "next/link";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { DesktopSectionNav, MobileSectionLinks } from "@/components/SectionNav";
import { displayName, touchLastSeen, validateRequest } from "@/lib/auth/session";
import { processMetricReminders } from "@/lib/metrics/reminders";
import { getPreviousLastSeenAt, getUnreadNotificationCount } from "@/lib/notifications/queries";

const mobileIndexLink =
  "shrink-0 px-3 py-2 text-xs uppercase tracking-[0.14em] text-text-muted transition-colors hover:text-accent focus-visible:outline-none";

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
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 md:px-6">
          <div className="flex items-center justify-between gap-4 py-4">
            <Link href="/" className="font-serif text-3xl leading-none text-text">
              hearth
            </Link>
            <div className="flex items-center gap-1">
              <div className="hidden md:block">
                <DesktopSectionNav />
              </div>
              <AppNav user={navUser} unreadCount={unreadCount} />
            </div>
          </div>
        </div>
        <nav
          className="flex flex-wrap items-center gap-1 border-t border-border px-4 py-2 md:hidden"
          aria-label="Main mobile"
        >
          <details className="relative shrink-0">
            <summary
              className={`${mobileIndexLink} inline-flex cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden`}
            >
              Sections
              <ChevronIcon />
            </summary>
            <div className="absolute top-full left-0 z-50 pt-1">
              <div className="min-w-52 rounded-sm border border-border bg-surface p-1">
                <MobileSectionLinks />
              </div>
            </div>
          </details>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-10">{children}</main>
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="ml-1"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
