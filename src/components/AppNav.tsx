"use client";

import Link from "next/link";
import { logout } from "@/lib/actions/auth";
import { FormSubmitButton } from "@/components/ui/FormSubmitButton";

export type AppNavUser = {
  displayName: string;
  role: "member" | "admin";
};

export function AppNav({ user, unreadCount = 0 }: { user: AppNavUser; unreadCount?: number }) {
  return (
    <div className="flex items-center gap-2">
      {user.role === "admin" ? (
        <Link
          href="/admin/users"
          className="hidden rounded-md px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-accent-soft hover:text-text sm:inline-flex"
        >
          Admin
        </Link>
      ) : null}
      <Link
        href="/notifications"
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-accent-soft hover:text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </Link>
      <details className="relative">
        <summary className="inline-flex h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-md px-3 text-sm font-medium text-text transition-colors hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none [&::-webkit-details-marker]:hidden">
          <UserIcon />
          <span className="ml-2 hidden sm:inline">{user.displayName}</span>
        </summary>
        <div className="absolute right-0 z-50 mt-1 min-w-[10rem] rounded-md border border-border bg-surface p-1 shadow-card">
          <Link
            href="/settings"
            className="flex select-none items-center rounded-sm px-3 py-2 text-sm text-text hover:bg-accent-soft"
          >
            Settings
          </Link>
          <form action={logout}>
            <FormSubmitButton
              pendingLabel="Signing out…"
              className="flex w-full cursor-pointer select-none items-center rounded-sm px-3 py-2 text-left text-sm text-text-muted hover:bg-accent-soft disabled:opacity-50"
            >
              Logout
            </FormSubmitButton>
          </form>
        </div>
      </details>
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
