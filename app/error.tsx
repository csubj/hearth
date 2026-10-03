"use client";

import { Button } from "@/components/ui/Button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md space-y-4 border-t border-border pt-6 text-center">
        <h1 className="font-serif text-2xl text-text">Something went wrong</h1>
        <p className="text-sm text-text-muted">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
        <Button type="button" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
