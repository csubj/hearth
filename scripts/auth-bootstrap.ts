#!/usr/bin/env tsx
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { count } from "drizzle-orm";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "../src/db/schema";
import { users } from "../src/db/schema/users";
import { hashPassword, validatePasswordPolicy } from "../src/lib/auth/password";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function resolveDatabasePath(): string {
  const url = process.env.DATABASE_URL ?? "file:./data/hearth.db";
  if (url.startsWith("file:")) {
    return path.resolve(projectRoot, url.slice("file:".length));
  }
  return url;
}

async function prompt(label: string, hidden = false): Promise<string> {
  if (process.env.HEARTH_BOOTSTRAP_USERNAME && label === "Username") {
    return process.env.HEARTH_BOOTSTRAP_USERNAME;
  }
  if (process.env.HEARTH_BOOTSTRAP_PASSWORD && hidden) {
    return process.env.HEARTH_BOOTSTRAP_PASSWORD;
  }
  if (process.env.HEARTH_BOOTSTRAP_DISPLAY_NAME && label === "Display name (optional)") {
    return process.env.HEARTH_BOOTSTRAP_DISPLAY_NAME;
  }

  const rl = readline.createInterface({ input, output });
  try {
    if (hidden) {
      process.stdout.write(`${label}: `);
      const password = await new Promise<string>((resolve) => {
        const chunks: Buffer[] = [];
        input.setRawMode?.(true);
        input.resume();
        input.on("data", (chunk: Buffer) => {
          const char = chunk.toString("utf8");
          if (char === "\n" || char === "\r" || char === "\u0004") {
            input.setRawMode?.(false);
            process.stdout.write("\n");
            resolve(Buffer.concat(chunks).toString("utf8"));
            return;
          }
          if (char === "\u0003") {
            process.exit(1);
          }
          if (char === "\u007f") {
            chunks.pop();
            return;
          }
          chunks.push(chunk);
        });
      });
      return password.trim();
    }
    const answer = await rl.question(`${label}: `);
    return answer.trim();
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const dbPath = resolveDatabasePath();
  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite, { schema });

  migrate(db, { migrationsFolder: path.join(projectRoot, "drizzle") });

  const [row] = await db.select({ value: count() }).from(users);
  if ((row?.value ?? 0) > 0) {
    console.error("Bootstrap refused: users already exist.");
    process.exit(1);
  }

  const username = await prompt("Username");
  const password = await prompt("Password", true);
  const displayNameRaw = await prompt("Display name (optional)");
  const displayName = displayNameRaw || null;

  if (!username || !password) {
    console.error("Username and password are required.");
    process.exit(1);
  }

  const policyError = validatePasswordPolicy(password);
  if (policyError) {
    console.error(policyError);
    process.exit(1);
  }

  const now = new Date();
  const passwordHash = await hashPassword(password);

  await db.insert(users).values({
    id: crypto.randomUUID(),
    username,
    displayName,
    passwordHash,
    role: "admin",
    createdAt: now,
    updatedAt: now,
  });

  console.log(`Bootstrap complete: admin user "${username}" created.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
