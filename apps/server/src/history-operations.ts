import { isPageOperator, parseOperatorEmails } from "@pricelog/api/operators";
import type { Context } from "hono";
import { ENV } from "./env.server";
import { createAuth, getDb } from "./services";
import { migratePricingHistoryBatch } from "./pricing/history-migration";
import { storeClient } from "./pricing/service";

export async function serveHistoryMigration(context: Context) {
  const db = getDb();
  const session = await (await createAuth(db)).api.getSession({ headers: context.req.raw.headers });
  if (!session?.user) return context.json({ error: "Unauthorized" }, 401);
  if (!isPageOperator({ session, operatorEmails: parseOperatorEmails(ENV.PAGE_OPERATOR_EMAILS) }))
    return context.json({ error: "Forbidden" }, 403);
  const cursor = context.req.query("cursor");
  if (cursor && cursor.length > 200) return context.json({ error: "Invalid cursor" }, 400);
  context.header("Cache-Control", "private, no-store");
  return context.json(
    await migratePricingHistoryBatch(db, (domain) => storeClient(ENV, domain), cursor),
  );
}
