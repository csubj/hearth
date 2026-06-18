"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";

export type Theme = "default" | "warm" | "dark" | "gamer";

const THEMES: Theme[] = ["default", "warm", "dark", "gamer"];

export type SettingsActionState = { error?: string; success?: boolean };

export async function updateTheme(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const { user } = await requireUser();
  const theme = String(formData.get("theme") ?? "");

  if (!THEMES.includes(theme as Theme)) {
    return { error: "Invalid theme selection." };
  }

  const now = new Date();
  await getDb()
    .update(users)
    .set({ theme: theme as Theme, updatedAt: now })
    .where(eq(users.id, user.id));

  revalidatePath("/", "layout");

  return { success: true };
}
