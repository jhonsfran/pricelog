import { isPageOperator, parseOperatorEmails } from "@pricelog/api/operators";
import { pageAccessCondition } from "@pricelog/api/routers/pages";
import { page } from "@pricelog/db/schema/pages";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";

import { ENV } from "./env.server";
import { pageMonitorService } from "./pricing/service";
import { createAuth, getDb } from "./services";

const KINDS = new Set(["html", "screenshot", "content"] as const);
type ArtifactKind = "html" | "screenshot" | "content";

export async function serveArtifact(context: Context): Promise<Response> {
  const pageId = context.req.param("pageId");
  const runId = context.req.param("runId");
  const kind = context.req.param("kind") as ArtifactKind;
  if (!pageId || !runId || !KINDS.has(kind)) return context.notFound();

  const db = getDb();
  const session = await (await createAuth(db)).api.getSession({ headers: context.req.raw.headers });
  if (!session?.user) return context.json({ error: "Unauthorized" }, 401);

  // The same rule as the pages API: owners see their pages, operators see every page.
  const operator = isPageOperator({
    session,
    operatorEmails: parseOperatorEmails(ENV.PAGE_OPERATOR_EMAILS),
  });
  const [owned] = await db
    .select({ normalizedDomain: page.normalizedDomain })
    .from(page)
    .where(pageAccessCondition(pageId, { userId: session.user.id, operator }))
    .limit(1);
  if (!owned) return context.notFound();

  const reference = await pageMonitorService.getArtifact(owned.normalizedDomain, runId, kind);
  if (!reference) return context.notFound();
  const object = await ENV.ARTIFACTS.get(reference.key);
  if (!object) return context.notFound();

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  // The screenshot and Markdown open in the browser. Captured HTML is third-party markup, so it
  // is only ever downloaded; Markdown is served as sandboxed plain text for the same reason.
  const inline = kind !== "html" && context.req.query("download") === undefined;
  headers.set(
    "Content-Type",
    kind === "content" ? "text/plain; charset=utf-8" : reference.contentType,
  );
  headers.set(
    "Content-Disposition",
    `${inline ? "inline" : "attachment"}; filename="${reference.filename}"`,
  );
  if (kind !== "screenshot") headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", "private, no-store");
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
}

/** Only archived text for published pages is public. HTML and owner artifacts remain private. */
export async function servePublicSource(context: Context): Promise<Response> {
  const pageId = context.req.param("pageId");
  const runId = context.req.param("runId");
  if (!pageId || !runId) return context.notFound();
  const [published] = await getDb()
    .select({ normalizedDomain: page.normalizedDomain })
    .from(page)
    .where(and(eq(page.state, "active"), eq(page.id, pageId)))
    .limit(1);
  if (!published) return context.notFound();
  const source = await pageMonitorService.getPublicSource(
    published.normalizedDomain,
    pageId,
    runId,
  );
  if (!source) return context.notFound();
  const object = await ENV.ARTIFACTS.get(source.key);
  if (!object) return context.notFound();
  return new Response(object.body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "public, max-age=300",
    },
  });
}
