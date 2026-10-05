import { serverClient } from "@/lib/orpc-server-client";
import { SettingsClient } from "./settings-client";

/**
 * Self-service settings page (task 5.2).
 *
 * Server Component that loads the profile and preferences, then hands off
 * to a Client Component for interactive forms and theme switching.
 */
export default async function SettingsPage() {
  let profile = { name: "", username: null as string | null, email: "" };
  let theme = "system";
  let loadError: string | null = null;

  try {
    const [profileResult, prefsResult] = await Promise.all([
      serverClient.getProfile({}),
      serverClient.getPreferences({}),
    ]);
    profile = {
      name: profileResult.name,
      username: profileResult.username,
      email: profileResult.email,
    };
    theme = prefsResult.theme;
  } catch {
    loadError = "Failed to load settings.";
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      {loadError ? (
        <p className="text-destructive">{loadError}</p>
      ) : (
        <SettingsClient initialProfile={profile} initialTheme={theme} />
      )}
    </div>
  );
}
