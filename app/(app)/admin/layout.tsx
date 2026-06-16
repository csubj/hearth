import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-text">Admin</h1>
          <p className="mt-1 text-sm text-text-muted">Household administration</p>
        </div>
        <nav aria-label="Admin">
          <Link
            href="/admin/users"
            className="rounded-md px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-accent-soft hover:text-text"
          >
            Users
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
