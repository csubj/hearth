"use client";

import { useState, useTransition, useEffect } from "react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { invoke } from "@/lib/actions/invoke";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProfileData {
  name: string;
  username: string | null;
  email: string;
}

// ---------------------------------------------------------------------------
// Hydration helper
// ---------------------------------------------------------------------------

const emptySubscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const inputClasses =
  "w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SettingsClient({
  initialProfile,
  initialTheme,
}: {
  initialProfile: ProfileData;
  initialTheme: string;
}) {
  const mounted = useMounted();
  const { setTheme } = useTheme();
  const [isPending, startTransition] = useTransition();

  // Messages
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Display name form
  const [displayName, setDisplayName] = useState(initialProfile.name);

  // Theme
  const [theme, setThemeState] = useState(initialTheme);

  // Password change form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Sync initial theme with next-themes on mount
  useEffect(() => {
    if (mounted) {
      setTheme(initialTheme);
    }
  }, [mounted, initialTheme, setTheme]);

  function clearMessages() {
    setError(null);
    setSuccess(null);
  }

  // ---- Display name ----

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    clearMessages();
    const [err] = await invoke("updateProfile", { name: displayName });
    if (err) {
      setError(err.message);
      return;
    }
    setSuccess("Display name updated.");
    startTransition(() => {});
  }

  // ---- Theme ----

  async function handleThemeChange(value: string) {
    clearMessages();
    setThemeState(value);
    setTheme(value);
    const [err] = await invoke("updatePreferences", { theme: value });
    if (err) {
      setError(err.message);
      return;
    }
    setSuccess("Theme updated.");
  }

  // ---- Password ----

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    clearMessages();

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    const [err] = await invoke("changePassword", {
      currentPassword,
      newPassword,
    });
    if (err) {
      setError(err.message);
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSuccess("Password changed. Other sessions have been signed out.");
  }

  const themes = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ] as const;

  return (
    <div className="space-y-8">
      {/* Messages */}
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
          {success}
        </p>
      )}

      {/* Profile info (read-only) */}
      <section className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-medium">Account</h2>
        <div className="grid gap-4 sm:grid-cols-2 text-sm">
          <div>
            <span className="text-muted-foreground">Username</span>
            <p className="font-mono">{initialProfile.username ?? "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Email</span>
            <p>{initialProfile.email}</p>
          </div>
        </div>
      </section>

      {/* Display name form */}
      <section className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-medium">Display Name</h2>
        <form onSubmit={handleUpdateProfile} className="flex gap-4 items-end">
          <div className="flex-1 space-y-1.5">
            <label htmlFor="display-name" className="text-sm font-medium">
              Name
            </label>
            <input
              id="display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputClasses}
              required
              maxLength={128}
            />
          </div>
          <Button type="submit" disabled={isPending}>
            Save
          </Button>
        </form>
      </section>

      {/* Theme selector */}
      <section className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-medium">Theme</h2>
        {mounted ? (
          <div className="flex gap-3">
            {themes.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => handleThemeChange(t.value)}
                className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  theme === t.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex gap-3">
            {themes.map((t) => (
              <div
                key={t.value}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium"
              >
                {t.label}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Password change form */}
      <section className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-medium">Change Password</h2>
        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <div className="space-y-1.5">
            <label htmlFor="current-password" className="text-sm font-medium">
              Current Password
            </label>
            <input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClasses}
              required
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="new-password" className="text-sm font-medium">
              New Password
            </label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClasses}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="confirm-password" className="text-sm font-medium">
              Confirm New Password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClasses}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" disabled={isPending}>
            Change Password
          </Button>
        </form>
      </section>
    </div>
  );
}
