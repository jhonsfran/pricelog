import { describe, expect, it } from "vitest";

import { artifactReference, nextAlarmAt } from "./page-store-logic";

const completedAt = Date.UTC(2026, 8, 20, 12);

describe("PageStore scheduling", () => {
  it("schedules seven days after a successful scan", () => {
    expect(nextAlarmAt("success", completedAt)).toBe(completedAt + 7 * 24 * 60 * 60 * 1000);
  });

  it("retries one day after a failed scan", () => {
    expect(nextAlarmAt("failure", completedAt)).toBe(completedAt + 24 * 60 * 60 * 1000);
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
