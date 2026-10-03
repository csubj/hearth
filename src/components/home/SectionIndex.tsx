import Link from "next/link";

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

const railLink =
  "block border-l border-border px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-text-muted transition-colors hover:border-accent hover:text-accent focus-visible:outline-none";

export function SectionIndex() {
  return (
    <aside className="hidden md:block" aria-label="Household record index">
      <nav className="sticky top-28">
        <p className="px-3 text-xs uppercase tracking-[0.14em] text-text-muted">Index</p>
        <div className="mt-2 flex flex-col">
          {sections.map((section, i) => (
            <Link key={section.href} href={section.href} className={railLink}>
              <span className="mr-2 tabular-nums text-text-muted">{String(i + 1).padStart(2, "0")}</span>
              {section.label}
            </Link>
          ))}
        </div>
      </nav>
    </aside>
  );
}