"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  { href: "/", label: "Home" },
  { href: "/restaurants", label: "Restaurants" },
  { href: "/projects", label: "Projects" },
  { href: "/metrics", label: "Metrics" },
  { href: "/inventory", label: "Inventory" },
  { href: "/maintenance", label: "Maintenance" },
  { href: "/home-log", label: "Home Log" },
  { href: "/reminders", label: "Reminders" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

const desktopBase =
  "shrink-0 px-1.5 py-2 text-[11px] uppercase tracking-[0.06em] transition-colors focus-visible:outline-none";

const mobileBase =
  "flex select-none items-center rounded-sm px-3 py-2 text-sm text-text hover:bg-accent-soft focus-visible:outline-none";

export function DesktopSectionNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-0.5" aria-label="Household record">
      {sections.map((section) => {
        const active = isActive(pathname, section.href);
        return (
          <Link
            key={section.href}
            href={section.href}
            className={active ? `${desktopBase} text-text` : `${desktopBase} text-text-muted hover:text-accent`}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileSectionLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col">
      {sections.map((section) => {
        const active = isActive(pathname, section.href);
        return (
          <Link
            key={section.href}
            href={section.href}
            onClick={onNavigate}
            className={active ? `${mobileBase} bg-accent-soft text-text` : mobileBase}
          >
            {section.label}
          </Link>
        );
      })}
    </div>
  );
}
