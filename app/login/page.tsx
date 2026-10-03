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
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <h1 className="font-serif text-4xl text-text">hearth</h1>
          <p className="mt-2 font-serif text-text-muted">Sign in to the household record</p>
        </header>
        <div className="border-t border-border pt-8">
          <LoginForm returnTo={returnTo} />
        </div>
      </div>
    </div>
  );
}