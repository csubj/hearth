import { and, count, eq, isNull, ne } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { users, type User } from "@/db/schema";

export type AdminDb = BetterSQLite3Database<typeof schema>;

export class AdminGuardError extends Error {
  constructor(public readonly guardError: string) {
    super(guardError);
    this.name = "AdminGuardError";
  }
}

export function countActiveAdmins(db: AdminDb, excludeUserId?: string): number {
  const conditions = [eq(users.role, "admin"), isNull(users.disabledAt)];
  if (excludeUserId) {
    conditions.push(ne(users.id, excludeUserId));
  }
  const [row] = db
    .select({ value: count() })
    .from(users)
    .where(and(...conditions))
    .all();
  return row?.value ?? 0;
}

export function canDisableUser(
  db: AdminDb,
  target: User,
  actingAdminId: string,
): { ok: true } | { ok: false; error: string } {
  if (target.disabledAt) {
    return { ok: false, error: "User is already disabled" };
  }

  if (target.role === "admin") {
    const otherAdmins = countActiveAdmins(db, target.id);
    if (otherAdmins === 0) {
      return { ok: false, error: "Cannot disable the last active admin" };
    }
  }

  if (target.id === actingAdminId && target.role === "admin") {
    const otherAdmins = countActiveAdmins(db, target.id);
    if (otherAdmins === 0) {
      return { ok: false, error: "Cannot disable yourself as the last admin" };
    }
  }

  return { ok: true };
}

export function canDemoteAdmin(
  db: AdminDb,
  target: User,
  actingAdminId: string,
): { ok: true } | { ok: false; error: string } {
  if (target.role !== "admin") {
    return { ok: false, error: "User is not an admin" };
  }

  if (target.id === actingAdminId) {
    const otherAdmins = countActiveAdmins(db, target.id);
    if (otherAdmins === 0) {
      return { ok: false, error: "Cannot demote yourself as the last admin" };
    }
  }

  const otherAdmins = countActiveAdmins(db, target.id);
  if (otherAdmins === 0) {
    return { ok: false, error: "Cannot demote the last active admin" };
  }

  return { ok: true };
}

export function assertCanDisableUser(db: AdminDb, target: User, actingAdminId: string): void {
  const guard = canDisableUser(db, target, actingAdminId);
  if (!guard.ok) {
    throw new AdminGuardError(guard.error);
  }
}

export function assertCanDemoteAdmin(db: AdminDb, target: User, actingAdminId: string): void {
  const guard = canDemoteAdmin(db, target, actingAdminId);
  if (!guard.ok) {
    throw new AdminGuardError(guard.error);
  }
}
