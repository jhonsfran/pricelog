import type { PageMonitorService } from "@pricelog/api/context";
import type { DescendingTimestampCursor } from "@pricelog/api/pagination";
import {
  createPricingHistoryRepository,
  type StoredPublicVersion,
} from "@pricelog/api/pricing-history-repository";
import { createDb, type Database } from "@pricelog/db";
import { page } from "@pricelog/db/schema/pages";
import { and, eq } from "drizzle-orm";
import { ENV } from "../env.server";
import type { ImportProgress } from "./legacy-history";
import { normalizePricingUrl, resolveDnsAddresses } from "./url";
import { verifiedVersionChanges } from "./version-changes";

type StoreClient = {
  migrateHistory(
    recordLimit?: number,
    identity?: { pageId: string; normalizedDomain: string; canonicalUrl: string },
  ): Promise<ImportProgress>;
  initializeAndStart: PageMonitorService["initializeAndStart"];
  listRuns(
    limit?: number,
    cursor?: DescendingTimestampCursor,
  ): ReturnType<PageMonitorService["listRuns"]>;
  getRun(runId: string): ReturnType<PageMonitorService["getRun"]>;
  triggerManual(userId: string): ReturnType<PageMonitorService["triggerManual"]>;
  getArtifact(
    runId: string,
    kind: "html" | "screenshot" | "content",
  ): ReturnType<PageMonitorService["getArtifact"]>;
};

type ServiceEnv = Pick<typeof ENV, "DB" | "PAGE_STORE" | "ARTIFACTS">;
export function storeClient(env: Pick<ServiceEnv, "PAGE_STORE">, domain: string): StoreClient {
  return (env.PAGE_STORE as unknown as { getByName(name: string): StoreClient }).getByName(domain);
}

export function createPageMonitorService(
  env: ServiceEnv,
  db: Database = createDb({ DB: env.DB }),
): PageMonitorService {
  const history = createPricingHistoryRepository(db);
  const store = (domain: string) => storeClient(env, domain);
  async function registry(domain: string, pageId?: string) {
    const [row] = await db
      .select()
      .from(page)
      .where(and(eq(page.normalizedDomain, domain), pageId ? eq(page.id, pageId) : undefined))
      .limit(1);
    return row ?? null;
  }
  async function ready(domain: string, pageId: string) {
    const row = await registry(domain, pageId);
    if (!row) return false;
    await history.requireReady(pageId);
    return true;
  }
  async function publicVersion(stored: StoredPublicVersion | null) {
    if (!stored) return null;
    const { contentKey, previous, ...version } = stored;
    const changes = await verifiedVersionChanges(
      previous,
      { contentKey, model: version.model, snapshot: version.snapshot },
      async (key) => (await env.ARTIFACTS.get(key))?.text() ?? null,
    );
    return {
      ...version,
      previous: previous ? { runId: previous.runId, capturedAt: previous.capturedAt } : null,
      changes,
    };
  }
  return {
    async getWeeklyHistory(domain, pageId, now) {
      if (!(await ready(domain, pageId))) throw new Error("Page does not belong to this domain");
      return history.getWeeklyHistory(pageId, now);
    },
    async persistComparison(domain, pageId, comparison) {
      if (!(await ready(domain, pageId))) throw new Error("Page does not belong to this domain");
      if (!comparison.beforeAnalysisId || !comparison.afterAnalysisId)
        throw new Error("Comparison analysis identities are required");
      await history.persistComparison(pageId, {
        ...comparison,
        beforeAnalysisId: comparison.beforeAnalysisId,
        afterAnalysisId: comparison.afterAnalysisId,
      });
    },
    async getPublicSource(domain, pageId, runId) {
      return (await ready(domain, pageId))
        ? history.getArtifact(pageId, runId, "content", true)
        : null;
    },
    async getPublicScreenshot(domain, pageId, runId) {
      return (await ready(domain, pageId))
        ? history.getArtifact(pageId, runId, "screenshot", true)
        : null;
    },
    async listPublicVersions(domain, pageId) {
      return (await ready(domain, pageId)) ? history.listPublicVersions(pageId) : [];
    },
    async getPublicPage(domain, pageId) {
      if (!(await ready(domain, pageId))) return { versions: [], version: null };
      const { versions, version } = await history.getPublicPage(pageId);
      return { versions, version: await publicVersion(version) };
    },
    async getPublicVersion(domain, pageId, runId) {
      return (await ready(domain, pageId))
        ? publicVersion(await history.getPublicVersion(pageId, runId))
        : null;
    },
    normalizeUrl(input) {
      return normalizePricingUrl(input, resolveDnsAddresses);
    },
    initializeAndStart(input) {
      return store(input.normalizedDomain).initializeAndStart(input);
    },
    listRuns(domain, limit, cursor) {
      return store(domain).listRuns(limit, cursor);
    },
    getRun(domain, runId) {
      return store(domain).getRun(runId);
    },
    triggerManual(domain, userId) {
      return store(domain).triggerManual(userId);
    },
    getArtifact(domain, runId, kind) {
      return store(domain).getArtifact(runId, kind);
    },
  };
}

export const pageMonitorService = createPageMonitorService(ENV);
