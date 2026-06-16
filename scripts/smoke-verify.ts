#!/usr/bin/env tsx
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { streamEntries, users } from "@/db/schema";
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

async function assertAuthenticatedStreamAccess(): Promise<{ userId: string; cookie: string }> {
  const [user] = await getDb().select().from(users).where(eq(users.username, USERNAME)).limit(1);
  if (!user) {
    throw new Error(`Bootstrap user "${USERNAME}" not found — run auth:bootstrap first`);
  }

  const lucia = getLucia();
  const session = await lucia.createSession(user.id, {});
  const cookie = `${lucia.sessionCookieName}=${session.id}`;

  const response = await fetch(`${BASE_URL}/stream`, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });

  if (response.status !== 200) {
    throw new Error(`Expected authenticated /stream access, got HTTP ${response.status}`);
  }

  return { userId: user.id, cookie };
}

async function assertStreamNoteVisible(userId: string, cookie: string): Promise<void> {
  const noteBody = `Smoke test note ${Date.now()}`;
  const now = new Date();
  const entryId = crypto.randomUUID();

  await getDb().insert(streamEntries).values({
    id: entryId,
    body: noteBody,
    roughWhen: null,
    isPinned: false,
    createdByUserId: userId,
    updatedByUserId: userId,
    createdAt: now,
    updatedAt: now,
  });

  const response = await fetch(`${BASE_URL}/stream`, {
    headers: { Cookie: cookie },
  });

  if (!response.ok) {
    throw new Error(`Failed to load /stream after inserting note: HTTP ${response.status}`);
  }

  const html = await response.text();
  if (!html.includes(noteBody)) {
    throw new Error("Inserted stream note was not visible on /stream");
  }

  const [user] = await getDb().select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    throw new Error("User missing after smoke insert");
  }

  console.log(`Verified stream note for ${user.displayName ?? user.username}`);
}

async function main(): Promise<void> {
  console.log(`Smoke verify against ${BASE_URL}`);
  await assertHealth();
  const { userId, cookie } = await assertAuthenticatedStreamAccess();
  await assertStreamNoteVisible(userId, cookie);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
