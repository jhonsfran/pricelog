import type { Context as ApiContext } from "@pricelog/api/context";
import { parseOperatorEmails } from "@pricelog/api/operators";
import { isAllowedEmail } from "@pricelog/auth";
import type { Context as HonoContext } from "hono";

import { ENV } from "./env.server";
import { getDb } from "./services";
import { createAuth } from "./services";
import { pageMonitorService } from "./pricing/service";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions): Promise<ApiContext> {
  const db = await getDb();
  const authSession = await (
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
    session,
    pageMonitor: pageMonitorService,
    operatorEmails: parseOperatorEmails(ENV.PAGE_OPERATOR_EMAILS),
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
