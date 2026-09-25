import type { Session } from "@my-better-t-app/auth";
import type { Database } from "@my-better-t-app/db";
import type { ScanRunStage } from "@my-better-t-app/db/scan-stage";

import type { Comparison, WeeklyPageHistory } from "./pricing-history";

import type { DescendingTimestampCursor } from "./pagination";

export type PageMonitorRun = {
  id: string;
  trigger: "initial" | "scheduled" | "manual";
  status: "queued" | "running" | "succeeded" | "failed";
  stage: ScanRunStage;
  requestedByUserId: string | null;
  browserEngine: "chromium" | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  events: Array<{
    stage: ScanRunStage;
    at: number;
    kind: "entered" | "warning" | "completed" | "failed";
    message?: string;
    httpStatus?: number;
    inputBytes?: number;
    outputBytes?: number;
  }>;
};

export type PageMonitorService = {
  getWeeklyHistory(domain: string, pageId: string, now: number): Promise<WeeklyPageHistory>;
  persistComparison(domain: string, pageId: string, comparison: Comparison): Promise<void>;
  getPublicSource(
    domain: string,
    pageId: string,
    runId: string,
  ): Promise<{ key: string; contentType: string; filename: string } | null>;
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
  /** Lowercase account emails that may open and scan every page, not only their own. */
  operatorEmails?: readonly string[];
};
