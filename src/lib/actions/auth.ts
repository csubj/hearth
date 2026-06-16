"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getLucia } from "@/lib/auth/lucia";
import { hashPassword, validatePasswordPolicy, verifyPassword } from "@/lib/auth/password";
import { requireUser } from "@/lib/auth/session";

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function loginKey(username: string, ip: string): string {
  return `${username.toLowerCase()}:${ip}`;
}

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    return false;
  }
  entry.count += 1;
  return true;
}

export type AuthActionState = {
  error?: string;
};

export async function login(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/");
  const ip = String(formData.get("ip") ?? "unknown");

  if (!username || !password) {
    return { error: "Username and password are required" };
  }

  if (!checkRateLimit(loginKey(username, ip))) {
    return { error: "Too many login attempts. Try again later." };
  }

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);

  if (!user || user.disabledAt) {
    return { error: "Invalid username or password" };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { error: "Invalid username or password" };
  }

  const lucia = getLucia();
  const session = await lucia.createSession(user.id, {});
  const sessionCookie = lucia.createSessionCookie(session.id);
  (await cookies()).set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

  const now = new Date();
  await db.update(users).set({ lastSeenAt: now, updatedAt: now }).where(eq(users.id, user.id));

  const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  redirect(safeReturnTo);
}

export async function logout(): Promise<void> {
  const lucia = getLucia();
  const sessionId = (await cookies()).get(lucia.sessionCookieName)?.value;
  if (sessionId) {
    await lucia.invalidateSession(sessionId);
  }
  const sessionCookie = lucia.createBlankSessionCookie();
  (await cookies()).set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
  redirect("/login");
}

export async function changePassword(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const { user } = await requireUser();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "All fields are required" };
  }

  if (newPassword !== confirmPassword) {
    return { error: "New passwords do not match" };
  }

  const policyError = validatePasswordPolicy(newPassword);
  if (policyError) {
    return { error: policyError };
  }

  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!row) {
    return { error: "User not found" };
  }

  const valid = await verifyPassword(currentPassword, row.passwordHash);
  if (!valid) {
    return { error: "Current password is incorrect" };
  }

  const passwordHash = await hashPassword(newPassword);
  const now = new Date();
  await db.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, user.id));

  const lucia = getLucia();
  await lucia.invalidateUserSessions(user.id);
  const session = await lucia.createSession(user.id, {});
  const sessionCookie = lucia.createSessionCookie(session.id);
  (await cookies()).set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

  redirect("/settings?toast=Password updated");
}
