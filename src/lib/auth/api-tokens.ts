import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { apiTokens, users } from "@/db/schema";
import { generateApiTokenSecret } from "@/lib/api/token-crypto";

export type ApiTokenListItem = {
  id: string;
  name: string;
  prefix: string;
  userId: string;
  username: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

export async function listApiTokens(): Promise<ApiTokenListItem[]> {
  const rows = await getDb()
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      userId: apiTokens.userId,
      username: users.username,
      lastUsedAt: apiTokens.lastUsedAt,
      revokedAt: apiTokens.revokedAt,
      createdAt: apiTokens.createdAt,
    })
    .from(apiTokens)
    .innerJoin(users, eq(apiTokens.userId, users.id))
    .orderBy(desc(apiTokens.createdAt));

  return rows;
}

export async function createApiTokenForUser(
  userId: string,
  name: string,
): Promise<{ id: string; token: string; prefix: string }> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Token name is required");
  }

  const [user] = await getDb().select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.disabledAt) {
    throw new Error("User not found or disabled");
  }

  const { token, prefix, tokenHash } = generateApiTokenSecret();
  const id = crypto.randomUUID();
  const now = new Date();

  await getDb().insert(apiTokens).values({
    id,
    userId,
    name: trimmedName,
    prefix,
    tokenHash,
    createdAt: now,
  });

  return { id, token, prefix };
}

export async function revokeApiTokenById(tokenId: string): Promise<boolean> {
  const db = getDb();
  const [existing] = await db.select().from(apiTokens).where(eq(apiTokens.id, tokenId)).limit(1);
  if (!existing || existing.revokedAt) {
    return false;
  }

  await db.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.id, tokenId));
  return true;
}
