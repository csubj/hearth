#!/usr/bin/env tsx
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projects, users } from "@/db/schema";
import { getLucia } from "@/lib/auth/lucia";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const USERNAME = process.env.HEARTH_BOOTSTRAP_USERNAME ?? "smokeadmin";

async function assertHealth(): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/health`);
  if (!response.ok) {
    throw new Error(`Health check failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as { ok?: boolean };
  if (!payload.ok) {
    throw new Error("Health check failed: response missing ok:true");
  }
}

async function assertAuthenticatedProjectsAccess(): Promise<{ userId: string; cookie: string }> {
  const [user] = await getDb().select().from(users).where(eq(users.username, USERNAME)).limit(1);
  if (!user) {
    throw new Error(`Bootstrap user "${USERNAME}" not found — run auth:bootstrap first`);
  }

  const lucia = getLucia();
  const session = await lucia.createSession(user.id, {});
  const cookie = `${lucia.sessionCookieName}=${session.id}`;

  const response = await fetch(`${BASE_URL}/projects`, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });

  if (response.status !== 200) {
    throw new Error(`Expected authenticated /projects access, got HTTP ${response.status}`);
  }

  return { userId: user.id, cookie };
}

async function assertProjectVisible(userId: string, cookie: string): Promise<void> {
  const title = `Smoke test project ${Date.now()}`;
  const now = new Date();
  const projectId = crypto.randomUUID();

  await getDb().insert(projects).values({
    id: projectId,
    title,
    notes: "Smoke test notes",
    status: "idea",
    priority: null,
    targetWhen: null,
    budgetCents: null,
    createdByUserId: userId,
    updatedByUserId: userId,
    createdAt: now,
    updatedAt: now,
  });

  const response = await fetch(`${BASE_URL}/projects`, {
    headers: { Cookie: cookie },
  });

  if (!response.ok) {
    throw new Error(`Failed to load /projects after inserting project: HTTP ${response.status}`);
  }

  const html = await response.text();
  if (!html.includes(title)) {
    throw new Error("Inserted project was not visible on /projects");
  }

  const [user] = await getDb().select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    throw new Error("User missing after smoke insert");
  }

  console.log(`Verified project for ${user.displayName ?? user.username}`);
}

async function main(): Promise<void> {
  console.log(`Smoke verify against ${BASE_URL}`);
  await assertHealth();
  const { userId, cookie } = await assertAuthenticatedProjectsAccess();
  await assertProjectVisible(userId, cookie);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
