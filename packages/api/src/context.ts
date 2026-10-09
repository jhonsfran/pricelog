import type { Session } from "@pricelog/auth";
import type { Database } from "@pricelog/db";
import type { ScanRunStage } from "@pricelog/db/scan-stage";

import type { PublicVersion, PublicVersionSummary } from "./page-versions";
import type { Comparison, WeeklyPageHistory } from "./pricing-history";

import type { DescendingTimestampCursor } from "./pagination";
import type { PublicCache } from "./public-cache";

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
  getPublicScreenshot(
    domain: string,
    pageId: string,
    runId: string,
  ): Promise<{ key: string; contentType: string; filename: string } | null>;
  listPublicVersions(domain: string, pageId: string): Promise<PublicVersionSummary[]>;
  getPublicPage(
    domain: string,
    pageId: string,
  ): Promise<{ versions: PublicVersionSummary[]; version: PublicVersion | null }>;
  getPublicVersion(domain: string, pageId: string, runId: string): Promise<PublicVersion | null>;
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
  publicCache?: PublicCache;
  reportCacheError?: (error: Error) => void;
  session: Session | null;
  db: Database;
  pageMonitor: PageMonitorService;
  /** Lowercase account emails that may open and scan every page, not only their own. */
  operatorEmails?: readonly string[];
};
