"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-lg border border-border bg-surface p-6 shadow-card">
      <h1 className="font-serif text-2xl text-text">Couldn&apos;t load this page</h1>
      <p className="text-sm text-text-muted">
        {error.message || "Something went wrong while loading this section."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-medium text-text-muted transition-colors hover:bg-accent-soft hover:text-text"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
