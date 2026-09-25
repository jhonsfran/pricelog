import { describe, expect, it } from "vitest";

import { artifactReference, nextAlarmAt, resolveRunCompletion } from "./page-store-logic";

const completedAt = Date.UTC(2026, 8, 20, 12);

describe("PageStore scheduling", () => {
  it("schedules seven days after any scan, including a failed one", () => {
    expect(nextAlarmAt(completedAt)).toBe(completedAt + 7 * 24 * 60 * 60 * 1000);
  });

  it("makes terminal run outcomes immutable and idempotent", () => {
    expect(resolveRunCompletion("running", "succeeded")).toBe("apply");
    expect(resolveRunCompletion("succeeded", "succeeded")).toBe("reuse");
    expect(() => resolveRunCompletion("succeeded", "failed")).toThrow(
      "Cannot change completed run from succeeded to failed",
    );
  });
});

describe("artifactReference", () => {
  const manifest = {
    htmlKey: "pages/example/runs/run/page.html",
    screenshotKey: "pages/example/runs/run/page.png",
    contentKey: "pages/example/runs/run/page.md",
  };

  it.each([
    ["html", manifest.htmlKey, "text/html; charset=utf-8"],
    ["screenshot", manifest.screenshotKey, "image/png"],
    ["content", manifest.contentKey, "text/markdown; charset=utf-8"],
  ] as const)("maps %s artifacts", (kind, key, contentType) => {
    expect(artifactReference(manifest, kind)).toMatchObject({ key, contentType });
  });
});
