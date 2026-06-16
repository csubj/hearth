"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { canDemoteAdmin, canDisableUser } from "@/lib/auth/admin-guards";
import { getLucia } from "@/lib/auth/lucia";
import { hashPassword, validatePasswordPolicy } from "@/lib/auth/password";
import { requireAdmin } from "@/lib/auth/session";

export type AdminActionState = {
  error?: string;
  success?: string;
};

export async function createUser(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "member") as "member" | "admin";

  if (!username || !password) {
    return { error: "Username and password are required" };
  }

  const policyError = validatePasswordPolicy(password);
  if (policyError) {
    return { error: policyError };
  }

  if (role !== "member" && role !== "admin") {
    return { error: "Invalid role" };
  }

  const db = getDb();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username));
  if (existing.length > 0) {
    return { error: "Username already exists" };
  }

  const now = new Date();
  const passwordHash = await hashPassword(password);
  await db.insert(users).values({
    id: crypto.randomUUID(),
    username,
    displayName,
    passwordHash,
    role,
    createdAt: now,
    updatedAt: now,
  });

  revalidatePath("/admin/users");
  return { success: `User "${username}" created` };
}

export async function resetUserPassword(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!userId || !password) {
    return { error: "User and password are required" };
  }

  const policyError = validatePasswordPolicy(password);
  if (policyError) {
    return { error: policyError };
  }

  const db = getDb();
  const passwordHash = await hashPassword(password);
  const now = new Date();
  const updated = await db
    .update(users)
    .set({ passwordHash, updatedAt: now })
    .where(eq(users.id, userId))
    .returning({ username: users.username });

  if (updated.length === 0) {
    return { error: "User not found" };
  }

  await getLucia().invalidateUserSessions(userId);
  revalidatePath("/admin/users");
  return { success: `Password reset for "${updated[0]!.username}"` };
}

export async function disableUser(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const { user: admin } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");

  if (!userId) {
    return { error: "User is required" };
  }

  const db = getDb();
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) {
    return { error: "User not found" };
  }

  const guard = await canDisableUser(target, admin.id);
  if (!guard.ok) {
    return { error: guard.error };
  }

  const now = new Date();
  await db.update(users).set({ disabledAt: now, updatedAt: now }).where(eq(users.id, userId));

  await getLucia().invalidateUserSessions(userId);
  revalidatePath("/admin/users");
  return { success: `User "${target.username}" disabled` };
}

export async function enableUser(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");

  if (!userId) {
    return { error: "User is required" };
  }

  const db = getDb();
  const now = new Date();
  const updated = await db
    .update(users)
    .set({ disabledAt: null, updatedAt: now })
    .where(eq(users.id, userId))
    .returning({ username: users.username });

  if (updated.length === 0) {
    return { error: "User not found" };
  }

  revalidatePath("/admin/users");
  return { success: `User "${updated[0]!.username}" enabled` };
}

export async function promoteToAdmin(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");

  if (!userId) {
    return { error: "User is required" };
  }

  const db = getDb();
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) {
    return { error: "User not found" };
  }

  if (target.role === "admin") {
    return { success: `"${target.username}" is already an admin` };
  }

  const now = new Date();
  await db.update(users).set({ role: "admin", updatedAt: now }).where(eq(users.id, userId));

  revalidatePath("/admin/users");
  return { success: `"${target.username}" promoted to admin` };
}

export async function demoteFromAdmin(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const { user: admin } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");

  if (!userId) {
    return { error: "User is required" };
  }

  const db = getDb();
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) {
    return { error: "User not found" };
  }

  const guard = await canDemoteAdmin(target, admin.id);
  if (!guard.ok) {
    return { error: guard.error };
  }

  const now = new Date();
  await db.update(users).set({ role: "member", updatedAt: now }).where(eq(users.id, userId));

  revalidatePath("/admin/users");
  return { success: `"${target.username}" demoted to member` };
}
