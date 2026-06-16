"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { createApiTokenForUser, revokeApiTokenById } from "@/lib/auth/api-tokens";
import { requireAdmin } from "@/lib/auth/session";
import { isNull } from "drizzle-orm";

export type ApiTokenActionState = {
  error?: string;
  success?: string;
  token?: string;
  prefix?: string;
};

const createTokenSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  userId: z.string().uuid("Select a user"),
});

const revokeTokenSchema = z.object({
  tokenId: z.string().uuid(),
});

export async function createToken(
  _prev: ApiTokenActionState,
  formData: FormData,
): Promise<ApiTokenActionState> {
  await requireAdmin();

  const parsed = createTokenSchema.safeParse({
    name: formData.get("name"),
    userId: formData.get("userId"),
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  try {
    const created = await createApiTokenForUser(parsed.data.userId, parsed.data.name);
    revalidatePath("/admin/api-tokens");
    return {
      success: "Token created — copy it now; it will not be shown again.",
      token: created.token,
      prefix: created.prefix,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create token" };
  }
}

export async function revokeToken(
  _prev: ApiTokenActionState,
  formData: FormData,
): Promise<ApiTokenActionState> {
  await requireAdmin();

  const parsed = revokeTokenSchema.safeParse({
    tokenId: formData.get("tokenId"),
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid token" };
  }

  const revoked = await revokeApiTokenById(parsed.data.tokenId);
  if (!revoked) {
    return { error: "Token not found or already revoked" };
  }

  revalidatePath("/admin/api-tokens");
  return { success: "Token revoked" };
}

export async function listUsersForTokenForm() {
  await requireAdmin();
  return getDb()
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      disabledAt: users.disabledAt,
    })
    .from(users)
    .where(isNull(users.disabledAt))
    .orderBy(users.username);
}
