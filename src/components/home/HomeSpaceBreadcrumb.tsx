import Link from "next/link";
import type { HomeBreadcrumb } from "@/lib/actions/home";

export function HomeSpaceBreadcrumb({ breadcrumb }: { breadcrumb: HomeBreadcrumb[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-1 text-sm text-text-muted"
    >
      <Link href="/home-log" className="transition-colors hover:text-text">
        Home Log
      </Link>
      {breadcrumb.map((crumb) => (
        <span key={crumb.id} className="flex items-center gap-1">
          <span aria-hidden="true">›</span>
          <Link href={`/home-log/${crumb.id}`} className="transition-colors hover:text-text">
            {crumb.name}
          </Link>
        </span>
      ))}
    </nav>
  );
}
