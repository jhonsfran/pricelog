import type { Context as ApiContext } from "@pricelog/api/context";
import { parseOperatorEmails } from "@pricelog/api/operators";
import { isAllowedEmail } from "@pricelog/auth";
import type { Context as HonoContext } from "hono";

import { ENV } from "./env.server";
import { getDb } from "./services";
import { createAuth } from "./services";
import { pageMonitorService } from "./pricing/service";
import { createPublicCache, isPublicDirectoryRequest } from "./public-cache";
import { useLogger } from "evlog/hono";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions): Promise<ApiContext> {
  const db = await getDb();
  const publicRequest = isPublicDirectoryRequest(context.req.raw);
  const reportCacheError = (error: Error) => useLogger().warn(error.message);
  const authSession = publicRequest
    ? null
    : await (
        await createAuth(db)
      ).api.getSession({
        headers: context.req.raw.headers,
      });
  const session =
    authSession && isAllowedEmail(authSession.user.email, ENV.PAGE_OPERATOR_EMAILS)
      ? authSession
      : null;
  return {
    db,
    publicCache: publicRequest
      ? createPublicCache(
          {
            waitUntil: (promise) => context.executionCtx.waitUntil(promise.catch(reportCacheError)),
          },
          new URL(context.req.url).hostname,
        )
      : undefined,
    reportCacheError,
    session,
    pageMonitor: pageMonitorService,
    operatorEmails: parseOperatorEmails(ENV.PAGE_OPERATOR_EMAILS),
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
