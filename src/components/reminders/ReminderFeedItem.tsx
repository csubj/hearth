import Link from "next/link";
import { MaintenanceLogReminderCompleteButton } from "@/components/reminders/MaintenanceLogReminderCompleteButton";
import { MaintenanceReminderCompleteButton } from "@/components/reminders/MaintenanceReminderCompleteButton";
import { formatReminderDueLabel } from "@/lib/reminders/interval";
import type { UpcomingReminder } from "@/lib/reminders/feed";

function kindLabel(kind: UpcomingReminder["kind"]): string {
  switch (kind) {
    case "inventory_maintenance":
      return "Item upkeep";
    case "maintenance_log":
      return "House maintenance";
    case "metric":
      return "Metric";
  }
}

export function ReminderFeedItem({
  reminder,
  compact = false,
}: {
  reminder: UpcomingReminder;
  compact?: boolean;
}) {
  const dueLabel = formatReminderDueLabel(reminder.dueAt);

  return (
    <li
      className={
        compact
          ? "flex items-start justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-accent-soft/50"
          : "flex items-start justify-between gap-3 rounded-md border border-border bg-background px-3 py-2.5"
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              reminder.status === "overdue"
                ? "bg-accent-soft text-accent"
                : "bg-background text-text-muted"
            }`}
          >
            {kindLabel(reminder.kind)}
          </span>
          <Link
            href={reminder.href}
            className="truncate text-sm font-medium text-text hover:text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            {reminder.title}
          </Link>
        </div>
        <p className="mt-0.5 text-xs text-text-muted">
          {reminder.contextLabel} · {reminder.intervalLabel}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span
          className={`text-xs font-medium ${
            reminder.status === "overdue" ? "text-accent" : "text-text-muted"
          }`}
        >
          {dueLabel}
        </span>
        {reminder.kind === "inventory_maintenance" &&
        reminder.inventoryItemId &&
        reminder.reminderId ? (
          <MaintenanceReminderCompleteButton
            inventoryItemId={reminder.inventoryItemId}
            reminderId={reminder.reminderId}
          />
        ) : reminder.kind === "maintenance_log" &&
          reminder.maintenanceLogId &&
          reminder.reminderId ? (
          <MaintenanceLogReminderCompleteButton
            maintenanceLogId={reminder.maintenanceLogId}
            reminderId={reminder.reminderId}
          />
        ) : (
          <Link
            href={reminder.href}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-text transition-colors hover:bg-accent-soft"
          >
            Log entry
          </Link>
        )}
      </div>
    </li>
  );
}
