import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@pricelog/db";
import * as schema from "@pricelog/db/schema/auth";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";

export type AuthConfig = {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  CORS_ORIGIN: string;
  PAGE_OPERATOR_EMAILS: string;
};

export function parseAllowedOrigins(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  ];
}

export function parseAllowedEmails(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export function isAllowedEmail(email: unknown, allowedEmails: string): boolean {
  return (
    typeof email === "string" &&
    parseAllowedEmails(allowedEmails).includes(email.trim().toLowerCase())
  );
}

export function createAuth(
  env: AuthConfig,
  database: Database,
  desktopOrigins: readonly string[] = [],
) {
  const allowedEmails = new Set(parseAllowedEmails(env.PAGE_OPERATOR_EMAILS));
  const isAllowed = (email: unknown): email is string =>
    typeof email === "string" && allowedEmails.has(email.trim().toLowerCase());

  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "sqlite",
      schema,
    }),
    trustedOrigins: [...parseAllowedOrigins(env.CORS_ORIGIN), ...desktopOrigins],
    emailAndPassword: { enabled: true },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-up/email" || ctx.path === "/sign-in/email") {
          if (!isAllowed(ctx.body?.email)) {
            throw new APIError("FORBIDDEN", { message: "Account access is restricted." });
          }
          return;
        }

        if (ctx.path === "/get-session") {
          const session = await getSessionFromCtx(ctx, {
            disableCookieCache: true,
            disableRefresh: true,
          });
          if (session && !isAllowed(session.user.email)) return ctx.json(null);
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!isAllowed(user.email)) {
              throw new APIError("FORBIDDEN", { message: "Account access is restricted." });
            }
          },
        },
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    },
    plugins: [],
  });
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
