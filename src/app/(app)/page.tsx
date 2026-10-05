import { Suspense } from "react";
import { TodayNeedsYou } from "./today/needs-you";
import { TodayDueSoon } from "./today/due-soon";
import { TodayActivity } from "./today/activity";
import { TodayPinned } from "./today/pinned";

/**
 * Today page (task 13.4, design D8/D17).
 *
 * The home page shows, in order: Needs you, Due soon, Recent activity, and
 * Pinned. Each section streams independently via Suspense so a slow section
 * never blocks the others. Each section renders its own empty state.
 */
export default function TodayPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
        <p className="text-sm text-muted-foreground">
          A quick overview of what needs your attention.
        </p>
      </div>

      <section aria-labelledby="today-needs-you">
        <h2 id="today-needs-you" className="mb-3 text-lg font-semibold tracking-tight">
          Needs you
        </h2>
        <Suspense fallback={<SectionSkeleton label="Loading inbox…" />}>
          <TodayNeedsYou />
        </Suspense>
      </section>

      <section aria-labelledby="today-due-soon">
        <h2 id="today-due-soon" className="mb-3 text-lg font-semibold tracking-tight">
          Due soon
        </h2>
        <Suspense fallback={<SectionSkeleton label="Loading reminders…" />}>
          <TodayDueSoon />
        </Suspense>
      </section>

      <section aria-labelledby="today-activity">
        <h2 id="today-activity" className="mb-3 text-lg font-semibold tracking-tight">
          Recent activity
        </h2>
        <Suspense fallback={<SectionSkeleton label="Loading activity…" />}>
          <TodayActivity />
        </Suspense>
      </section>

      <section aria-labelledby="today-pinned">
        <h2 id="today-pinned" className="mb-3 text-lg font-semibold tracking-tight">
          Pinned
        </h2>
        <Suspense fallback={<SectionSkeleton label="Loading pins…" />}>
          <TodayPinned />
        </Suspense>
      </section>
    </div>
  );
}

function SectionSkeleton({ label }: { label: string }) {
  return (
    <div className="flex h-16 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
      {label}
    </div>
  );
}
