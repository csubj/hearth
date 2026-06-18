"use client";

import Link from "next/link";

const browseLinks = [
  { href: "/browse", label: "Overview" },
  { href: "/projects", label: "Projects" },
  { href: "/restaurants", label: "Restaurants" },
  { href: "/metrics", label: "Metrics" },
  { href: "/inventory", label: "Inventory" },
] as const;

const linkClassName =
  "flex select-none items-center rounded-sm px-3 py-2 text-sm text-text hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none";

export function BrowseMenu() {
  return (
    <details className="relative hidden md:block">
      <summary className="inline-flex cursor-pointer list-none items-center rounded-md px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-accent-soft hover:text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        Browse
        <ChevronIcon />
      </summary>
      <div className="absolute left-0 z-50 mt-1 min-w-44 rounded-md border border-border bg-surface p-1 shadow-card">
        {browseLinks.map((link) => (
          <Link key={link.href} href={link.href} className={linkClassName}>
            {link.label}
          </Link>
        ))}
      </div>
    </details>
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
