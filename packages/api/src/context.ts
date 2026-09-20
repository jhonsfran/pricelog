import type { Session } from "@my-better-t-app/auth";
import type { Database } from "@my-better-t-app/db";

import type { DescendingTimestampCursor } from "./pagination";

export type PageMonitorRun = {
  id: string;
  trigger: "initial" | "scheduled" | "manual";
  status: "queued" | "running" | "succeeded" | "failed";
  stage: "queued" | "capture" | "persist" | "evaluate" | "publish" | "complete";
  requestedByUserId: string | null;
  browserEngine: "chromium" | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
};

export type PageMonitorService = {
  normalizeUrl(input: string): Promise<{ canonicalUrl: string; normalizedDomain: string }>;
  initializeAndStart(input: {
    pageId: string;
    normalizedDomain: string;
    canonicalUrl: string;
    requestedByUserId: string;
  }): Promise<PageMonitorRun>;
  listRuns(
    domain: string,
    limit?: number,
    cursor?: DescendingTimestampCursor,
  ): Promise<{
    items: PageMonitorRun[];
    nextCursor: DescendingTimestampCursor | null;
  }>;
  getRun(domain: string, runId: string): Promise<PageMonitorRun | null>;
  triggerManual(domain: string, requestedByUserId: string): Promise<PageMonitorRun>;
  getArtifact(
    domain: string,
    runId: string,
    kind: "html" | "screenshot" | "content",
  ): Promise<{ key: string; contentType: string; filename: string } | null>;
};

export type Context = {
  session: Session | null;
  db: Database;
  pageMonitor: PageMonitorService;
};
