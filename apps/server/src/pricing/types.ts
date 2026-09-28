import type { PublicVersion } from "@pricelog/api/page-versions";
import type { PublishedSnapshot } from "@pricelog/db/pricing-snapshot";
import type { ScanRunStage } from "@pricelog/db/scan-stage";

export type RunTrigger = "initial" | "scheduled" | "manual";
export type RunStatus = "queued" | "running" | "succeeded" | "failed";
export type RunStage = ScanRunStage;
export type RunEvent = {
  stage: RunStage;
  at: number;
  kind: "entered" | "warning" | "completed" | "failed";
  message?: string;
  httpStatus?: number;
  inputBytes?: number;
  outputBytes?: number;
};
export type ArtifactKind = "html" | "screenshot" | "content";

export type ScanWorkflowParams = {
  pageId: string;
  normalizedDomain: string;
  canonicalUrl: string;
  runId: string;
  trigger: RunTrigger;
};

export type PageRunDto = {
  id: string;
  trigger: RunTrigger;
  status: RunStatus;
  stage: RunStage;
  requestedByUserId: string | null;
  browserEngine: "chromium" | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  events: RunEvent[];
};

export type ArtifactManifest = {
  capturedAt: number;
  httpStatus: number;
  finalUrl: string;
  title: string | null;
  htmlKey: string;
  screenshotKey: string;
  contentKey: string;
  htmlSha256: string;
  screenshotSha256: string;
  contentSha256: string;
  htmlBytes: number;
  screenshotBytes: number;
  contentBytes: number;
};

type PersistedQuestionBase = {
  key: string;
  instructions: string;
  position: number;
};

export type PersistedChoiceQuestion = PersistedQuestionBase & {
  type: "choice";
  criteria: Record<string, string>;
  minimum: null;
  maximum: null;
};

export type PersistedNoulQuestion = PersistedQuestionBase & {
  type: "noul";
  criteria: { true: string; false: string };
  minimum: null;
  maximum: null;
};

export type PersistedQuestion = PersistedChoiceQuestion | PersistedNoulQuestion;

export type PersistedRubric = {
  id: string;
  model: string;
  version: number;
  questions: PersistedQuestion[];
};

export type JevChoiceAnswer = {
  key: string;
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};

export type JevNoulAnswer = {
  key: string;
  type: "noul";
  noul: number;
};

export type JevAnswer = JevChoiceAnswer | JevNoulAnswer;

export type ArtifactReference = {
  key: string;
  contentType: string;
  filename: string;
};

/** A published version as the page store returns it: archive keys stay inside the worker. */
export type StoredPublicVersion = Omit<PublicVersion, "previous" | "changes"> & {
  contentKey: string;
  previous: {
    runId: string;
    capturedAt: number;
    contentKey: string;
    model: string;
    snapshot: PublishedSnapshot | null;
  } | null;
};
