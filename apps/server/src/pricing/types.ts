export type RunTrigger = "initial" | "scheduled" | "manual";
export type RunStatus = "queued" | "running" | "succeeded" | "failed";
export type RunStage = "queued" | "capture" | "persist" | "evaluate" | "publish" | "complete";
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

export type PersistedQuestion = {
  key: string;
  type: "score";
  instructions: string;
  criteria: string[];
  minimum: number;
  maximum: number;
  position: number;
};

export type PersistedRubric = {
  id: string;
  model: string;
  version: number;
  questions: PersistedQuestion[];
};

export type JevAnswer = {
  key: string;
  score: number;
  confidence: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
};

export type ArtifactReference = {
  key: string;
  contentType: string;
  filename: string;
};
