import { LoginForm } from "./login-form";

/**
 * Sanitize a `returnTo` query parameter to prevent open redirects.
 * Only same-origin paths (starting with `/` but not `//`) are accepted.
 */
function sanitizeReturnTo(value: string | undefined): string {
  if (typeof value !== "string") return "/";
  const v = value.trim();
  if (!v.startsWith("/") || v.startsWith("//")) return "/";
  return v;
}

interface LoginPageProps {
  searchParams: Promise<{ returnTo?: string }>;
}

/**
 * Sign-in page (`/login`).
 *
 * Reads `returnTo` from the query string, sanitizes it, and passes it to the
 * client form component so the server action can redirect there on success.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { returnTo } = await searchParams;
  const safeReturnTo = sanitizeReturnTo(returnTo);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">hearth</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to your household
          </p>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <LoginForm returnTo={safeReturnTo} />
        </div>
      </div>
    </main>
  );
}
