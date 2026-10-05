"use client";

/**
 * App shell (task 13.1).
 *
 * Renders the registry-driven sidebar (>=768px) listing Today, Inbox (with
 * unread count), each registered module, Settings and Admin (for admins), and
 * a mobile bottom bar (Today, Search, Create, Inbox, Menu) on narrower
 * screens. Touch targets are at least 44px on mobile.
 *
 * The shell also hosts the global Create dialog (task 13.2), so Create works
 * from anywhere.
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Inbox as InboxIcon,
  Search as SearchIcon,
  Plus,
  Menu as MenuIcon,
  Settings as SettingsIcon,
  ShieldCheck,
} from "lucide-react";
import { moduleIcon } from "@/components/module-icon";
import { QuickCreateDialog, type QuickCreateModule } from "@/components/quick-create-dialog";

export interface AppShellNavModule {
  type: string;
  singular: string;
  plural: string;
  icon: string | undefined;
  placeRule: string;
  quickCreate: boolean;
}

export interface AppShellProps {
  modules: AppShellNavModule[];
  isAdmin: boolean;
  inboxCount: number;
  children: React.ReactNode;
}

function NavLink({
  href,
  label,
  icon,
  active,
  count,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-[44px] items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      }`}
      aria-current={active ? "page" : undefined}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && count > 0 ? (
        <span className="rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Link>
  );
}

export function AppShell({
  modules,
  isAdmin,
  inboxCount,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const PlacesIcon = moduleIcon("map-pin");

  const quickCreateModules: QuickCreateModule[] = useMemo(
    () =>
      modules
        .filter((m) => m.quickCreate)
        .map((m) => ({
          type: m.type,
          singular: m.singular,
          plural: m.plural,
          icon: m.icon,
          placeRule: m.placeRule,
          fields: [],
        })),
    [modules],
  );

  const openCreate = useCallback(() => {
    setMenuOpen(false);
    setCreateOpen(true);
  }, []);

  const openSearch = useCallback(() => {
    setMenuOpen(false);
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
    );
  }, []);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const moduleLinks = modules
    .filter((m) => m.type !== "place")
    .map((m) => {
      const IconComp = moduleIcon(m.icon);
      return {
        href: `/${m.type}`,
        label: m.plural,
        key: m.type,
        iconNode: <IconComp className="h-4 w-4" />,
        active: isActive(`/${m.type}`),
      };
    });

  return (
    <div className="min-h-screen bg-background">
      {/* Skip link for keyboard users (task 13.5). */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>

      {/* Sidebar (>=768px) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-background md:flex">
        <div className="flex h-14 items-center border-b px-4">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            hearth
          </Link>
        </div>
        <nav
          aria-label="Main navigation"
          className="flex-1 space-y-1 overflow-y-auto p-3"
        >
          <NavLink
            href="/"
            label="Today"
            icon={<Home className="h-4 w-4" />}
            active={isActive("/")}
          />
          <NavLink
            href="/inbox"
            label="Inbox"
            icon={<InboxIcon className="h-4 w-4" />}
            active={isActive("/inbox")}
            count={inboxCount}
          />
          <div className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Modules
          </div>
          {moduleLinks.map((m) => (
            <NavLink
              key={m.key}
              href={m.href}
              label={m.label}
              icon={m.iconNode}
              active={m.active}
            />
          ))}
          <div className="space-y-1 pt-4">
            <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Account
            </div>
            <NavLink
              href="/places"
              label="Places"
              icon={<PlacesIcon className="h-4 w-4" />}
              active={isActive("/places")}
            />
            <NavLink
              href="/settings"
              label="Settings"
              icon={<SettingsIcon className="h-4 w-4" />}
              active={isActive("/settings")}
            />
            {isAdmin && (
              <NavLink
                href="/admin/users"
                label="Admin"
                icon={<ShieldCheck className="h-4 w-4" />}
                active={isActive("/admin")}
              />
            )}
          </div>
        </nav>
        <div className="border-t p-3">
          <button
            type="button"
            onClick={openCreate}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            data-testid="create-btn"
          >
            <Plus className="h-4 w-4" />
            Create
          </button>
        </div>
      </aside>

      {/* Mobile header strip */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background px-4 md:hidden">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          hearth
        </Link>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={openSearch}
            aria-label="Search"
            className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <SearchIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Mobile bottom bar */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background md:hidden"
      >
        <MobileNavItem
          href="/"
          label="Today"
          icon={<Home className="h-5 w-5" />}
          active={isActive("/")}
        />
        <MobileNavItem
          onClick={openSearch}
          label="Search"
          icon={<SearchIcon className="h-5 w-5" />}
          active={false}
        />
        <MobileNavItem
          onClick={openCreate}
          label="Create"
          icon={<Plus className="h-5 w-5" />}
          active={false}
          dataTestId="mobile-create"
        />
        <MobileNavItem
          href="/inbox"
          label="Inbox"
          icon={<InboxIcon className="h-5 w-5" />}
          active={isActive("/inbox")}
          count={inboxCount}
        />
        <MobileNavItem
          onClick={() => setMenuOpen((v) => !v)}
          label="Menu"
          icon={<MenuIcon className="h-5 w-5" />}
          active={menuOpen}
        />
      </nav>
      <div className="pb-16 md:pb-0" />

      {/* Main content */}
      <div className="md:pl-60">
        <main id="main" className="mx-auto max-w-5xl px-6 py-8 pb-24 md:pb-8">
          {children}
        </main>
      </div>

      <QuickCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        modules={quickCreateModules}
      />

      {menuOpen && <MobileMenu onClose={() => setMenuOpen(false)} />}
    </div>
  );
}

// A mobile bottom-bar item — each is a 44px+ touch target.
function MobileNavItem({
  href,
  onClick,
  label,
  icon,
  active,
  count,
  dataTestId,
}: {
  href?: string;
  onClick?: () => void;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  count?: number;
  dataTestId?: string;
}) {
  const cls = `relative flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
    active
      ? "text-primary"
      : "text-muted-foreground hover:text-foreground"
  }`;

  if (href) {
    return (
      <Link href={href} className={cls} aria-label={label} aria-current={active ? "page" : undefined} data-testid={dataTestId}>
        {icon}
        <span>{label}</span>
        {count !== undefined && count > 0 ? (
          <span className="absolute translate-y-[-26px] rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${cls} relative`}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      data-testid={dataTestId}
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && count > 0 ? (
        <span className="absolute translate-y-[-26px] rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </button>
  );
}

// A slide-up sheet listing the full nav on mobile (Menu item).
function MobileMenu({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 rounded-t-xl border-t bg-background p-4 pb-24">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Menu
        </p>
        <div className="space-y-1">
          <MenuLink href="/" label="Today" onClose={onClose} />
          <MenuLink href="/inbox" label="Inbox" onClose={onClose} />
          <MenuLink href="/places" label="Places" onClose={onClose} />
          <MenuLink href="/settings" label="Settings" onClose={onClose} />
        </div>
      </div>
    </div>
  );
}

function MenuLink({
  href,
  label,
  onClose,
}: {
  href: string;
  label: string;
  onClose: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClose}
      className="flex min-h-[44px] items-center rounded-md px-3 text-base font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
    </Link>
  );
}
