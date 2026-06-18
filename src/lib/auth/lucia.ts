import { DrizzleSQLiteAdapter } from "@lucia-auth/adapter-drizzle";
import { Lucia, TimeSpan } from "lucia";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

let luciaInstance: ReturnType<typeof createLucia> | null = null;

function createLucia() {
  const adapter = new DrizzleSQLiteAdapter(getDb(), sessions, users);
  return new Lucia(adapter, {
    sessionExpiresIn: new TimeSpan(30, "d"),
    sessionCookie: {
      name: SESSION_COOKIE_NAME,
      expires: false,
      attributes: {
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    },
    getUserAttributes: (attributes) => ({
      username: attributes.username,
      displayName: attributes.displayName,
      role: attributes.role,
      theme: attributes.theme,
      disabledAt: attributes.disabledAt,
    }),
  });
}

export function getLucia(): ReturnType<typeof createLucia> {
  if (!luciaInstance) {
    luciaInstance = createLucia();
  }
  return luciaInstance;
}

/** Test-only: recreate Lucia after DB reset. */
export function resetLuciaForTests(): void {
  luciaInstance = null;
}

declare module "lucia" {
  interface Register {
    Lucia: ReturnType<typeof createLucia>;
    DatabaseUserAttributes: {
      username: string;
      displayName: string | null;
      role: "member" | "admin";
      theme: "default" | "warm" | "dark" | "gamer";
      disabledAt: Date | null;
    };
  }
}

export type AuthUser = import("lucia").User;
export type AuthSession = import("lucia").Session;
