import { serverClient } from "@/lib/orpc-server-client";
import { ApiKeysClient } from "./api-keys-client";

/**
 * API keys page (task 5.3).
 *
 * Server Component that loads the current user's API keys, then hands off
 * to a Client Component for create/revoke interactions.
 */
export default async function ApiKeysPage() {
  let keys: Array<{
    id: string;
    name: string | null;
    start: string | null;
    prefix: string | null;
    createdAt: string | Date;
    lastRequest: string | Date | null;
    enabled: boolean;
    expiresAt: string | Date | null;
  }> = [];
  let loadError: string | null = null;

  try {
    const result = await serverClient.listApiKeys({});
    keys = result.keys;
  } catch {
    loadError = "Failed to load API keys.";
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
      <p className="text-sm text-muted-foreground">
        Create API keys to grant programmatic access that acts as you.
        The full key is shown only once at creation.
      </p>
      {loadError ? (
        <p className="text-destructive">{loadError}</p>
      ) : (
        <ApiKeysClient initialKeys={keys} />
      )}
    </div>
  );
}
