import type { PageMonitorService } from "@my-better-t-app/api/context";
import type { DescendingTimestampCursor } from "@my-better-t-app/api/pagination";

import { ENV } from "../env.server";
import { normalizePricingUrl, resolveDnsAddresses } from "./url";

type StoreClient = {
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
