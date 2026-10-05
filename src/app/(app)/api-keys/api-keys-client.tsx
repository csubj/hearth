"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { invoke } from "@/lib/actions/invoke";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiKeyRow {
  id: string;
  name: string | null;
  start: string | null;
  prefix: string | null;
  createdAt: string | Date;
  lastRequest: string | Date | null;
  enabled: boolean;
  expiresAt: string | Date | null;
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const inputClasses =
  "w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "Never";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApiKeysClient({
  initialKeys,
}: {
  initialKeys: ApiKeyRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const [keys, setKeys] = useState<ApiKeyRow[]>(initialKeys);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create form
  const [newKeyName, setNewKeyName] = useState("");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function clearMessages() {
    setError(null);
    setSuccess(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    clearMessages();
    setCreatedSecret(null);
    setCopied(false);

    const [err, data] = await invoke("createApiKey", { name: newKeyName });
    if (err) {
      setError(err.message);
      return;
    }

    const created = data as {
      id: string;
      name: string | null;
      start: string | null;
      prefix: string | null;
      key: string;
      createdAt: string | Date;
      expiresAt: string | Date | null;
    };

    setCreatedSecret(created.key);
    setNewKeyName("");

    // Add the new key to the list (without the secret)
    setKeys((prev) => [
      {
        id: created.id,
        name: created.name,
        start: created.start,
        prefix: created.prefix,
        createdAt: created.createdAt,
        lastRequest: null,
        enabled: true,
        expiresAt: created.expiresAt,
      },
      ...prev,
    ]);

    startTransition(() => {});
  }

  async function handleRevoke(keyId: string) {
    clearMessages();
    const [err] = await invoke("revokeApiKey", { keyId });
    if (err) {
      setError(err.message);
      return;
    }
    setKeys((prev) => prev.filter((k) => k.id !== keyId));
    setSuccess("API key revoked.");
    startTransition(() => {});
  }

  function handleCopy() {
    if (createdSecret) {
      navigator.clipboard.writeText(createdSecret).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  function handleDismissSecret() {
    setCreatedSecret(null);
    setCopied(false);
  }

  return (
    <div className="space-y-6">
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

      {/* Secret display (shown once after creation) */}
      {createdSecret && (
        <section className="rounded-lg border border-yellow-500/50 bg-yellow-50 p-4 dark:bg-yellow-900/20 space-y-3">
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            Your API key (shown only once — copy it now):
          </p>
          <div className="flex gap-2 items-center">
            <code className="flex-1 break-all rounded bg-background px-3 py-2 text-xs font-mono border">
              {createdSecret}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
            >
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDismissSecret}
          >
            Dismiss
          </Button>
        </section>
      )}

      {/* Create form */}
      <section className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-medium">Create API Key</h2>
        <form onSubmit={handleCreate} className="flex gap-4 items-end">
          <div className="flex-1 space-y-1.5">
            <label htmlFor="key-name" className="text-sm font-medium">
              Key Name
            </label>
            <input
              id="key-name"
              type="text"
              placeholder='e.g. "Claude"'
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className={inputClasses}
              required
              maxLength={32}
            />
          </div>
          <Button type="submit" disabled={isPending}>
            Create
          </Button>
        </form>
      </section>

      {/* Keys list */}
      <section className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-medium">Your API Keys</h2>
        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
        ) : (
          <div className="space-y-3">
            {keys.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between rounded-md border px-4 py-3"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {k.name ?? "Unnamed key"}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {k.start ?? k.prefix ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Created {formatDate(k.createdAt)}
                    {" · "}
                    Last used {formatDate(k.lastRequest)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => handleRevoke(k.id)}
                  disabled={isPending}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
