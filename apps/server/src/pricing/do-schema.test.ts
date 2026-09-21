import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import {
  answer,
  versionEvaluation,
  versionComparison,
  pageConfig,
  pageVersion,
  question,
  questionSet,
  scanRun,
  schedulerState,
} from "./do-schema";

describe("page durable object schema", () => {
  it("defines every private state table", () => {
    expect(
      [
        pageConfig,
        schedulerState,
        scanRun,
        pageVersion,
        questionSet,
        question,
        answer,
        versionEvaluation,
        versionComparison,
      ].map((table) => getTableConfig(table).name),
    ).toEqual([
      "page_config",
      "scheduler_state",
      "scan_run",
      "page_version",
      "question_set",
      "question",
      "answer",
      "version_evaluation",
      "version_comparison",
    ]);
  });

  it("keeps large page data out of sqlite", () => {
    expect(Object.keys(pageVersion)).toEqual(
      expect.arrayContaining(["htmlKey", "screenshotKey", "contentKey"]),
    );
    expect(Object.keys(pageVersion)).not.toContain("html");
    expect(Object.keys(pageVersion)).not.toContain("screenshot");
  });

  it("stores typed Jev questions and answers", () => {
    expect(Object.keys(question)).toEqual(expect.arrayContaining(["type", "criteria"]));
    expect(Object.keys(answer)).toEqual(
      expect.arrayContaining(["type", "choice", "noul", "confidence", "probabilities"]),
    );
  });
});
