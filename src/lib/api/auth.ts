import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { apiTokens, users } from "@/db/schema";
import type { AuthUser } from "@/lib/auth/lucia";
import { hashApiToken } from "@/lib/api/token-crypto";
import { unauthorizedError } from "@/lib/api/errors";

export type ApiTokenAuthResult =
  | { ok: true; user: AuthUser; tokenId: string }
  | { ok: false; response: Response };

function userRowToAuthUser(row: typeof users.$inferSelect): AuthUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    theme: row.theme,
    disabledAt: row.disabledAt,
  };
}

export async function requireApiToken(request: Request): Promise<ApiTokenAuthResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, response: unauthorizedError() };
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return { ok: false, response: unauthorizedError() };
  }

  const prefix = token.slice(0, 16);
  const db = getDb();
  const [tokenRow] = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.prefix, prefix))
    .limit(1);

  if (!tokenRow || tokenRow.revokedAt) {
    return { ok: false, response: unauthorizedError() };
  }

  if (hashApiToken(token) !== tokenRow.tokenHash) {
    return { ok: false, response: unauthorizedError() };
  }

  const [userRow] = await db.select().from(users).where(eq(users.id, tokenRow.userId)).limit(1);
  if (!userRow || userRow.disabledAt) {
    return { ok: false, response: unauthorizedError() };
  }

  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, tokenRow.id));

  return { ok: true, user: userRowToAuthUser(userRow), tokenId: tokenRow.id };
}

/** Test-only: create api_tokens table when migrations are not yet generated. */
export function ensureApiTokensTableForTests(): void {
  const db = getDb();
  db.run(sql`
    CREATE TABLE IF NOT EXISTS api_tokens (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL,
      name text NOT NULL,
      prefix text NOT NULL UNIQUE,
      token_hash text NOT NULL,
      last_used_at integer,
      revoked_at integer,
      created_at integer NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  db.run(sql`CREATE INDEX IF NOT EXISTS api_tokens_user_id_idx ON api_tokens (user_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS api_tokens_prefix_idx ON api_tokens (prefix)`);
}
