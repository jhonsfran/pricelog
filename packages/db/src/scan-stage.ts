/** Ordered stages for new scans. Each stage names one durable pipeline boundary. */
export const SCAN_PIPELINE_STAGES = [
  "queued",
  "capture",
  "archive",
  "draft",
  "verify",
  "project",
  "store",
  "publish",
  "complete",
] as const;
export type ScanPipelineStage = (typeof SCAN_PIPELINE_STAGES)[number];

/** Earlier run records can still report these stages. New scans do not use them. */
export const SCAN_RUN_STAGES = [...SCAN_PIPELINE_STAGES, "persist", "evaluate"] as const;
export type ScanRunStage = (typeof SCAN_RUN_STAGES)[number];
export type ScanPipelinePhase = "control" | "extract" | "transform" | "load";

export const SCAN_STAGE_DETAILS = {
  queued: { phase: "control", label: "Queued" },
  capture: { phase: "extract", label: "Capturing page" },
  archive: { phase: "extract", label: "Archiving capture" },
  draft: { phase: "transform", label: "Extracting draft" },
  verify: { phase: "transform", label: "Checking claims" },
  project: { phase: "transform", label: "Selecting supported facts" },
  store: { phase: "load", label: "Storing evaluation" },
  publish: { phase: "load", label: "Publishing directory record" },
  complete: { phase: "control", label: "Complete" },
  persist: { phase: "load", label: "Persisting capture" },
  evaluate: { phase: "transform", label: "Evaluating capture" },
} as const satisfies Record<ScanRunStage, { phase: ScanPipelinePhase; label: string }>;
