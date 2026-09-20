import type { PageMonitorService } from "@my-better-t-app/api/context";

import { ENV } from "../env.server";
import { normalizePricingUrl } from "./url";

type StoreClient = {
  initializeAndStart: PageMonitorService["initializeAndStart"];
  listRuns: (limit?: number, cursor?: number) => ReturnType<PageMonitorService["listRuns"]>;
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
    return normalizePricingUrl(input, resolveHost);
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

async function resolveHost(hostname: string): Promise<string[]> {
  const responses = await Promise.all(
    ["A", "AAAA"].map(async (type) => {
      const response = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
        { headers: { accept: "application/dns-json" } },
      );
      if (!response.ok) throw new Error("DNS resolution failed");
      const body = (await response.json()) as { Answer?: { data: string; type: number }[] };
      return (body.Answer ?? [])
        .filter((answer) => answer.type === 1 || answer.type === 28)
        .map((answer) => answer.data);
    }),
  );
  return responses.flat();
}
