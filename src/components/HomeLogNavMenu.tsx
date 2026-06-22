"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HoverDetailsMenu } from "@/components/HoverDetailsMenu";

export type HomeLogNavProperty = {
  id: string;
  name: string;
  address: string | null;
};

const navLinkClassName =
  "rounded-md px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-accent-soft hover:text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none";

const menuItemClassName =
  "flex select-none flex-col rounded-sm px-3 py-2 text-sm text-text hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none";

const chevronButtonClassName =
  "inline-flex h-full cursor-pointer list-none items-center rounded-r-md px-1.5 py-2 text-text-muted transition-colors hover:bg-accent-soft hover:text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none [&::-webkit-details-marker]:hidden";

function ChevronIcon({ className }: { className?: string }) {
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
      className={className}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function PropertyLinks({ properties }: { properties: HomeLogNavProperty[] }) {
  if (properties.length === 0) {
    return (
      <p className="px-3 py-2 text-sm text-text-muted">
        No properties yet.{" "}
        <Link href="/home-log" className="text-accent hover:text-accent/80">
          Add one
        </Link>
      </p>
    );
  }

  return properties.map((property) => (
    <Link key={property.id} href={`/home-log/${property.id}`} className={menuItemClassName}>
      <span>{property.name}</span>
      {property.address ? (
        <span className="text-xs text-text-muted">{property.address}</span>
      ) : null}
    </Link>
  ));
}

function isHomeLogActive(pathname: string): boolean {
  return pathname === "/home-log" || pathname.startsWith("/home-log/");
}

export function HomeLogNavMenu({
  properties,
  variant,
}: {
  properties: HomeLogNavProperty[];
  variant: "desktop" | "mobile";
}) {
  const pathname = usePathname();
  const active = isHomeLogActive(pathname);
  const activeClassName = active ? "bg-accent-soft text-text" : "";

  if (variant === "desktop") {
    return (
      <div className="relative flex items-stretch">
        <Link href="/home-log" className={`${navLinkClassName} rounded-r-none ${activeClassName}`}>
          Home Log
        </Link>
        <HoverDetailsMenu
          className="relative flex"
          panelClassName="min-w-52 rounded-md border border-border bg-surface p-1 shadow-card"
          summaryClassName={`${chevronButtonClassName} ${active ? "bg-accent-soft text-text" : ""}`}
          summary={
            <>
              <ChevronIcon />
              <span className="sr-only">Browse properties</span>
            </>
          }
        >
          <PropertyLinks properties={properties} />
        </HoverDetailsMenu>
      </div>
    );
  }

  return (
    <details className="relative shrink-0">
      <summary
        className={`${navLinkClassName} inline-flex cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden ${activeClassName}`}
      >
        Home Log
        <ChevronIcon className="ml-1" />
      </summary>
      <div className="absolute top-full left-0 z-50 pt-1">
        <div className="min-w-52 rounded-md border border-border bg-surface p-1 shadow-card">
          <Link href="/home-log" className={menuItemClassName}>
            Add property
          </Link>
          <PropertyLinks properties={properties} />
        </div>
      </div>
    </details>
  );
}
