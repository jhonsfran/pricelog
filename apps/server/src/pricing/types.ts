import type { ScanRunStage } from "@pricelog/db/scan-stage";
export type {
  ArtifactManifest,
  HistoryRun as PageRunDto,
  JevAnswer,
  PersistedQuestion,
  PersistedRubric,
  RunEvent,
} from "@pricelog/db/history-types";
export type RunTrigger = "initial" | "scheduled" | "manual";
export type RunStatus = "queued" | "running" | "succeeded" | "failed";
export type RunStage = ScanRunStage;
export type ArtifactKind = "html" | "screenshot" | "content";
export type ScanWorkflowParams = {
  pageId: string;
  normalizedDomain: string;
  canonicalUrl: string;
  runId: string;
  trigger: RunTrigger;
};

export type ArtifactReference = {
  key: string;
  contentType: string;
  filename: string;
};

export type { StoredPublicVersion } from "@pricelog/api/pricing-history-repository";
