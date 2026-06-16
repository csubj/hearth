import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <header>
        <h1 className="font-serif text-2xl text-text">Settings</h1>
        <p className="mt-1 text-sm text-text-muted">Manage your account</p>
      </header>
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
