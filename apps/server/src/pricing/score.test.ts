import { describe, expect, it } from "vitest";

import {
  TRUNCATION_MARKER,
  budgetMarkdown,
  calculateOverallScore,
  normalizeJevScore,
} from "./score";

describe("score helpers", () => {
  it("keeps short markdown unchanged", () => {
    expect(budgetMarkdown("short")).toBe("short");
  });

  it("keeps the first 16k and last 8k characters", () => {
    const input = `${"a".repeat(16_001)}${"b".repeat(8_001)}`;
    const result = budgetMarkdown(input);
    expect(result).toBe(`${input.slice(0, 16_000)}${TRUNCATION_MARKER}${input.slice(-8_000)}`);
  });

  it("normalizes Jev scores to 0 through 100", () => {
    expect(normalizeJevScore(0)).toBe(0);
    expect(normalizeJevScore(2.5)).toBe(62.5);
    expect(normalizeJevScore(9)).toBe(100);
  });

  it("calculates an unweighted mean", () => {
    expect(calculateOverallScore([0, 25, 50, 75, 100])).toBe(50);
  });
});
