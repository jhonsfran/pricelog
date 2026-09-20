import { page } from "@my-better-t-app/db/schema/pages";
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

  const [owned] = await db
    .select({ normalizedDomain: page.normalizedDomain })
    .from(page)
    .where(and(eq(page.id, pageId), eq(page.ownerUserId, session.user.id)))
    .limit(1);
  if (!owned) return context.notFound();

  const reference = await pageMonitorService.getArtifact(owned.normalizedDomain, runId, kind);
  if (!reference) return context.notFound();
  const object = await ENV.ARTIFACTS.get(reference.key);
  if (!object) return context.notFound();

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", reference.contentType);
  headers.set("Content-Disposition", `attachment; filename="${reference.filename}"`);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", "private, no-store");
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
}
