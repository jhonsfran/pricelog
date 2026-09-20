import type { ArtifactKind, ArtifactManifest, ArtifactReference, RunStatus } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export function nextAlarmAt(outcome: "success" | "failure", completedAt: number): number {
  return completedAt + (outcome === "success" ? WEEK_MS : DAY_MS);
}

export function resolveRunCompletion(
  current: RunStatus,
  requested: "succeeded" | "failed",
): "apply" | "reuse" {
  if (current === "queued" || current === "running") return "apply";
  if (current === requested) return "reuse";
  throw new Error(`Cannot change completed run from ${current} to ${requested}`);
}

export function artifactReference(
  manifest: Pick<ArtifactManifest, "htmlKey" | "screenshotKey" | "contentKey">,
  kind: ArtifactKind,
): ArtifactReference {
  if (kind === "screenshot") {
    return { key: manifest.screenshotKey, contentType: "image/png", filename: "pricing-page.png" };
  }
  if (kind === "content") {
    return {
      key: manifest.contentKey,
      contentType: "text/markdown; charset=utf-8",
      filename: "pricing-page.md",
    };
  }
  return {
    key: manifest.htmlKey,
    contentType: "text/html; charset=utf-8",
    filename: "pricing-page.html",
  };
}
