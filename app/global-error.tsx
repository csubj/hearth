"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-[#faf8f5] font-sans text-[#1c1917] antialiased">
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="max-w-md space-y-4 rounded-lg border border-[#e8e4df] bg-white p-6 text-center shadow-sm">
            <h1 className="text-2xl font-semibold">Something went wrong</h1>
            <p className="text-sm text-[#78716c]">
              {error.message || "An unexpected error occurred. Please try again."}
            </p>
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-11 items-center justify-center rounded-md bg-[#c2410c] px-4 text-sm font-medium text-white"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
