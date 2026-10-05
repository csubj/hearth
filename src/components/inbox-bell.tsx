"use client";

/**
 * Inbox bell (task 10.3, design D8).
 *
 * Shows the unread attention count, capped at "9+". Clicking navigates to the
 * inbox page. Reads the count through the shared `invoke` on mount; it is
 * refreshed whenever the user navigates back (the page re-mounts).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { invoke } from "@/lib/actions/invoke";

export function InboxBell() {
  const [count, setCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [error, data] = await invoke("inboxCount", {});
    if (!error && data) {
      setCount((data as { count: number }).count);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const display = count == null ? "0" : count > 9 ? "9+" : String(count);

  return (
    <Link
      href="/inbox"
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
      aria-label="Inbox"
    >
      <Bell className="h-5 w-5" />
      {(count ?? 0) > 0 ? (
        <span
          className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
          data-testid="bell-count"
        >
          {display}
        </span>
      ) : null}
    </Link>
  );
}
