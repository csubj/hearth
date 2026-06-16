import { and, count, eq, isNull, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { users, type User } from "@/db/schema";

export async function countActiveAdmins(excludeUserId?: string): Promise<number> {
  const conditions = [eq(users.role, "admin"), isNull(users.disabledAt)];
  if (excludeUserId) {
    conditions.push(ne(users.id, excludeUserId));
  }
  const [row] = await getDb()
    .select({ value: count() })
    .from(users)
    .where(and(...conditions));
  return row?.value ?? 0;
}

export async function canDisableUser(
  target: User,
  actingAdminId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (target.disabledAt) {
    return { ok: false, error: "User is already disabled" };
  }

  if (target.role === "admin") {
    const otherAdmins = await countActiveAdmins(target.id);
    if (otherAdmins === 0) {
      return { ok: false, error: "Cannot disable the last active admin" };
    }
  }

  if (target.id === actingAdminId && target.role === "admin") {
    const otherAdmins = await countActiveAdmins(target.id);
    if (otherAdmins === 0) {
      return { ok: false, error: "Cannot disable yourself as the last admin" };
    }
  }

  return { ok: true };
}

export async function canDemoteAdmin(
  target: User,
  actingAdminId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (target.role !== "admin") {
    return { ok: false, error: "User is not an admin" };
  }

  if (target.id === actingAdminId) {
    const otherAdmins = await countActiveAdmins(target.id);
    if (otherAdmins === 0) {
      return { ok: false, error: "Cannot demote yourself as the last admin" };
    }
  }

  const otherAdmins = await countActiveAdmins(target.id);
  if (otherAdmins === 0) {
    return { ok: false, error: "Cannot demote the last active admin" };
  }

  return { ok: true };
}
