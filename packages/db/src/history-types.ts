import type { NumericPrices } from "./numeric-prices";
import type { PublishedSnapshot, SnapshotReview } from "./pricing-snapshot";
import type { ScanRunStage } from "./scan-stage";
import type { PageChoice, PageSignal } from "./schema/pages";

export type PublicEvaluation = {
  choices: PageChoice[];
  signals: PageSignal[];
  tags: string[];
  numericPrices?: NumericPrices;
  draft?: string;
  snapshot?: PublishedSnapshot;
  review?: SnapshotReview[];
  pipeline?: string;
  coverage?: { literals: number; claimed: number } | null;
};

export type RunEvent = {
  stage: ScanRunStage;
  at: number;
  kind: "entered" | "warning" | "completed" | "failed";
  message?: string;
  httpStatus?: number;
  inputBytes?: number;
  outputBytes?: number;
};

export type HistoryRun = {
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

export type JevAnswer =
  | {
      key: string;
      type: "choice";
      choice: string;
      confidence: number;
      probabilities: Record<string, number>;
    }
  | { key: string; type: "noul"; noul: number };

export type PersistedQuestion = {
  key: string;
  instructions: string;
  position: number;
  minimum: null;
  maximum: null;
} & (
  | { type: "choice"; criteria: Record<string, string> }
  | { type: "noul"; criteria: { true: string; false: string } }
);

export type PersistedRubric = {
  id: string;
  model: string;
  version: number;
  questions: PersistedQuestion[];
};

export type AnalysisEnvelope = {
  id: string;
  idempotencyKey: string;
  runId: string;
  rubricId: string;
  model: string;
  createdAt: number;
  evaluation: PublicEvaluation;
  answers: JevAnswer[];
};

export type CaptureMetadata = { displayName: string; description: string | null };

export type TerminalArchive = {
  source: "legacy" | "scan";
  pageId: string;
  run: HistoryRun & { status: "succeeded" | "failed" };
  capture: ArtifactManifest | null;
  analysis: AnalysisEnvelope | null;
  rubrics: PersistedRubric[];
  answers: { rubricId: string; values: JevAnswer[] }[];
  metadata: CaptureMetadata | null;
  nextScanAt: number | null;
};

export const initialAnalysisId = (pageId: string, runId: string) => `initial:${pageId}:${runId}`;

export function artifactReference(
  manifest: Pick<ArtifactManifest, "htmlKey" | "screenshotKey" | "contentKey">,
  kind: "html" | "screenshot" | "content",
) {
  if (kind === "screenshot")
    return { key: manifest.screenshotKey, contentType: "image/png", filename: "pricing-page.png" };
  if (kind === "content")
    return {
      key: manifest.contentKey,
      contentType: "text/markdown; charset=utf-8",
      filename: "pricing-page.md",
    };
  return {
    key: manifest.htmlKey,
    contentType: "text/html; charset=utf-8",
    filename: "pricing-page.html",
  };
}
