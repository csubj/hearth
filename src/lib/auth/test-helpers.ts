import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users, type User } from "@/db/schema";
import { getLucia } from "@/lib/auth/lucia";
import { hashPassword } from "@/lib/auth/password";

export async function createTestUser(
  overrides: Partial<{
    username: string;
    password: string;
    displayName: string | null;
    role: "member" | "admin";
    disabledAt: Date | null;
  }> = {},
): Promise<User & { plainPassword: string }> {
  const username = overrides.username ?? `user_${crypto.randomUUID().slice(0, 8)}`;
  const plainPassword = overrides.password ?? "password123";
  const now = new Date();

  const row: User = {
    id: crypto.randomUUID(),
    username,
    displayName: overrides.displayName ?? null,
    passwordHash: await hashPassword(plainPassword),
    role: overrides.role ?? "member",
    theme: "default",
    disabledAt: overrides.disabledAt ?? null,
    lastSeenAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await getDb().insert(users).values(row);
  return { ...row, plainPassword };
}

export async function loginAs(userId: string): Promise<string> {
  const session = await getLucia().createSession(userId, {});
  return session.id;
}

export async function createAdminSession(): Promise<{ user: User; sessionId: string }> {
  const user = await createTestUser({ username: "admin", role: "admin" });
  const sessionId = await loginAs(user.id);
  return { user, sessionId };
}

export async function getUserByUsername(username: string): Promise<User | undefined> {
  const [user] = await getDb().select().from(users).where(eq(users.username, username)).limit(1);
  return user;
}
