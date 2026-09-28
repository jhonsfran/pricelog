import type { PageMonitorService } from "@pricelog/api/context";
import type { DescendingTimestampCursor } from "@pricelog/api/pagination";

import { ENV } from "../env.server";
import type { StoredPublicVersion } from "./types";
import { normalizePricingUrl, resolveDnsAddresses } from "./url";
import { verifiedVersionChanges } from "./version-changes";

type StoreClient = {
  getWeeklyHistory: (
    pageId: string,
    now: number,
  ) => ReturnType<PageMonitorService["getWeeklyHistory"]>;
  persistComparison: (
    pageId: string,
    comparison: Parameters<PageMonitorService["persistComparison"]>[2],
  ) => Promise<void>;
  getPublicSource: (
    pageId: string,
    runId: string,
  ) => ReturnType<PageMonitorService["getPublicSource"]>;
  getPublicScreenshot: (
    pageId: string,
    runId: string,
  ) => ReturnType<PageMonitorService["getPublicScreenshot"]>;
  listPublicVersions: (pageId: string) => ReturnType<PageMonitorService["listPublicVersions"]>;
  getPublicVersion: (pageId: string, runId: string) => Promise<StoredPublicVersion | null>;
  initializeAndStart: PageMonitorService["initializeAndStart"];
  listRuns: (
    limit?: number,
    cursor?: DescendingTimestampCursor,
  ) => ReturnType<PageMonitorService["listRuns"]>;
  getRun: (runId: string) => ReturnType<PageMonitorService["getRun"]>;
  triggerManual: (userId: string) => ReturnType<PageMonitorService["triggerManual"]>;
  getArtifact: (
    runId: string,
    kind: "html" | "screenshot" | "content",
  ) => ReturnType<PageMonitorService["getArtifact"]>;
};

function getStore(domain: string): StoreClient {
  return (ENV.PAGE_STORE as unknown as { getByName(name: string): StoreClient }).getByName(domain);
}

export const pageMonitorService: PageMonitorService = {
  getWeeklyHistory(domain, pageId, now) {
    return getStore(domain).getWeeklyHistory(pageId, now);
  },
  persistComparison(domain, pageId, comparison) {
    return getStore(domain).persistComparison(pageId, comparison);
  },
  getPublicSource(domain, pageId, runId) {
    return getStore(domain).getPublicSource(pageId, runId);
  },
  getPublicScreenshot(domain, pageId, runId) {
    return getStore(domain).getPublicScreenshot(pageId, runId);
  },
  listPublicVersions(domain, pageId) {
    return getStore(domain).listPublicVersions(pageId);
  },
  async getPublicVersion(domain, pageId, runId) {
    const stored = await getStore(domain).getPublicVersion(pageId, runId);
    if (!stored) return null;
    const { contentKey, previous, ...version } = stored;
    const changes = await verifiedVersionChanges(
      previous,
      { contentKey, model: version.model, snapshot: version.snapshot },
      async (key) => (await ENV.ARTIFACTS.get(key))?.text() ?? null,
    );
    return {
      ...version,
      previous: previous ? { runId: previous.runId, capturedAt: previous.capturedAt } : null,
      changes,
    };
  },
  normalizeUrl(input) {
    return normalizePricingUrl(input, resolveDnsAddresses);
  },
  initializeAndStart(input) {
    return getStore(input.normalizedDomain).initializeAndStart(input);
  },
  listRuns(domain, limit, cursor) {
    return getStore(domain).listRuns(limit, cursor);
  },
  getRun(domain, runId) {
    return getStore(domain).getRun(runId);
  },
  triggerManual(domain, requestedByUserId) {
    return getStore(domain).triggerManual(requestedByUserId);
  },
  getArtifact(domain, runId, kind) {
    return getStore(domain).getArtifact(runId, kind);
  },
};
