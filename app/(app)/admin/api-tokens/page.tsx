import { listApiTokens } from "@/lib/auth/api-tokens";
import { listUsersForTokenForm } from "@/lib/actions/admin/api-tokens";
import { AdminApiTokensPanel } from "./AdminApiTokensPanel";

export default async function AdminApiTokensPage() {
  const [tokens, users] = await Promise.all([listApiTokens(), listUsersForTokenForm()]);

  return (
    <AdminApiTokensPanel
      tokens={tokens.map((token) => ({
        id: token.id,
        name: token.name,
        prefix: token.prefix,
        username: token.username,
        lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
        revokedAt: token.revokedAt?.toISOString() ?? null,
        createdAt: token.createdAt.toISOString(),
      }))}
      users={users.map((user) => ({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
      }))}
    />
  );
}
