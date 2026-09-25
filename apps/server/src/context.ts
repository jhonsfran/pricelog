import type { Context as ApiContext } from "@my-better-t-app/api/context";
import { parseOperatorEmails } from "@my-better-t-app/api/operators";
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
  const session = await (
    await createAuth(db)
  ).api.getSession({
    headers: context.req.raw.headers,
  });
  return {
    db,
    session,
    pageMonitor: pageMonitorService,
    operatorEmails: parseOperatorEmails(ENV.PAGE_OPERATOR_EMAILS),
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
