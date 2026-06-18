import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { ThemePicker } from "@/components/settings/ThemePicker";
import { validateRequest } from "@/lib/auth/session";
import type { Theme } from "@/lib/actions/settings";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string }>;
}) {
  const params = await searchParams;
  const { user } = await validateRequest();
  const currentTheme = (user?.theme ?? "default") as Theme;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="font-serif text-2xl text-text">Settings</h1>
        <p className="mt-1 text-sm text-text-muted">Manage your account</p>
      </header>
      <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <h2 className="text-lg font-medium text-text">Appearance</h2>
        <p className="mt-1 text-sm text-text-muted">Choose a color theme for your hearth.</p>
        <div className="mt-4">
          <ThemePicker currentTheme={currentTheme} />
        </div>
      </section>
      {params.changed === "1" ? (
        <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          Password updated successfully.
        </p>
      ) : null}
      <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <h2 className="text-lg font-medium text-text">Change password</h2>
        <p className="mt-1 text-sm text-text-muted">
          Minimum 8 characters. You will stay signed in on this device.
        </p>
        <div className="mt-4">
          <ChangePasswordForm />
        </div>
      </section>
    </div>
  );
}
