import { describe, expect, it } from "vitest";

import { artifactKeys, parseJevAnswers } from "./scan-workflow-logic";

describe("artifactKeys", () => {
  it("uses deterministic private paths", () => {
    expect(artifactKeys("example.com", "run-1")).toEqual({
      htmlKey: "pages/example.com/runs/run-1/page.html",
      screenshotKey: "pages/example.com/runs/run-1/page.png",
      contentKey: "pages/example.com/runs/run-1/page.md",
    });
  });
});

describe("parseJevAnswers", () => {
  const questions = [
    {
      key: "clarity",
      type: "score" as const,
      instructions: "How clear is it?",
      criteria: ["unclear", "clear"],
      minimum: 0,
      maximum: 1,
      position: 0,
    },
  ];

  it("validates and maps score answers", () => {
    expect(
      parseJevAnswers(
        {
          answers: {
            clarity: {
              score: 0.75,
              confidence: 0.9,
              probabilities: { "0": 0.25, "1": 0.75 },
            },
          },
        },
        questions,
      ),
    ).toEqual([
      {
        key: "clarity",
        score: 0.75,
        confidence: 0.9,
        legend: { "0": "unclear", "1": "clear" },
        probabilities: { "0": 0.25, "1": 0.75 },
      },
    ]);
  });

  it("rejects missing answers", () => {
    expect(() => parseJevAnswers({ answers: {} }, questions)).toThrow("clarity");
  });
});
