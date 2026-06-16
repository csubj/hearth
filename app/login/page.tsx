import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { validateRequest } from "@/lib/auth/session";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { user } = await validateRequest();
  if (user) {
    redirect("/");
  }

  const params = await searchParams;
  const returnTo = params.returnTo ?? "/";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-surface p-6 shadow-card">
        <header className="text-center">
          <h1 className="font-serif text-3xl text-text">hearth</h1>
          <p className="mt-2 text-sm text-text-muted">Sign in to your household</p>
        </header>
        <LoginForm returnTo={returnTo} />
      </div>
    </div>
  );
}
