import type { Context as ApiContext } from "@pricelog/api/context";
import { parseOperatorEmails } from "@pricelog/api/operators";
import { isAllowedEmail } from "@pricelog/auth";
import type { Context as HonoContext } from "hono";

import { ENV } from "./env.server";
import { getDb } from "./services";
import { createAuth } from "./services";
import { pageMonitorService } from "./pricing/service";
import {
  createCacheErrorReporter,
  createPublicCache,
  isPublicDirectoryRequest,
} from "./public-cache";
import { useLogger } from "evlog/hono";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions): Promise<ApiContext> {
  const db = await getDb();
  const publicRequest = isPublicDirectoryRequest(context.req.raw);
  const parentRequestId = useLogger().getContext().requestId;
  const reportCacheError = createCacheErrorReporter(
    context.executionCtx,
    context.req.raw,
    typeof parentRequestId === "string" ? parentRequestId : undefined,
  );
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
      ? createPublicCache(context.executionCtx, new URL(context.req.url).hostname, reportCacheError)
      : undefined,
    reportCacheError,
    session,
    pageMonitor: pageMonitorService,
    operatorEmails: parseOperatorEmails(ENV.PAGE_OPERATOR_EMAILS),
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
