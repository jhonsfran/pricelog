import { describe, expect, it, vi } from "vitest";
import {
  buildEvaluationRequest,
  evaluatePricing,
  MAX_EVALUATION_SOURCE_BYTES,
  MAX_EVALUATION_REQUEST_BYTES,
} from "./evaluation-request";
import { PRICING_INTELLIGENCE_RUBRIC } from "./rubric";
import type { PersistedQuestion } from "./types";

const questions: PersistedQuestion[] = Object.entries(PRICING_INTELLIGENCE_RUBRIC.questions).map(
  ([key, question], position) => ({ ...question, key, position, minimum: null, maximum: null }),
);
function answer(input: { questions: Record<string, unknown> }, model = "jev-1.13.0") {
  return {
    model,
    answers: Object.fromEntries(
      Object.entries(input.questions).map(([key, raw]) => {
        const question = raw as PersistedQuestion;
        const choice = Object.keys(question.criteria)[0]!;
        return [
          key,
          question.type === "noul"
            ? { noul: 0.9 }
            : { choice, confidence: 0.9, probabilities: { [choice]: 0.9 } },
        ];
      }),
    ),
  };
}
describe("full-source evaluation requests", () => {
  it.each(["x".repeat(10_000), "x".repeat(24_000), "é".repeat(35_000), "x".repeat(70_000)])(
    "sends the real rubric once while preserving all source and questions",
    (source) => {
      const evaluation = buildEvaluationRequest(source, questions);
      expect(evaluation.input.state).toBe(source);
      expect(evaluation.questions).toEqual(questions);
      expect(
        new TextEncoder().encode(JSON.stringify(evaluation.input)).byteLength,
      ).toBeLessThanOrEqual(MAX_EVALUATION_REQUEST_BYTES);
      expect(buildEvaluationRequest(source, questions)).toEqual(evaluation);
    },
  );
  it("rejects a question that cannot fit without truncation", () => {
    expect(() =>
      buildEvaluationRequest("x".repeat(24_000), [
        {
          ...questions[0]!,
          instructions: "x".repeat(MAX_EVALUATION_REQUEST_BYTES),
        },
      ]),
    ).toThrow("safe transport limit");
  });
  it("enforces the source byte limit without truncation", () => {
    expect(() =>
      buildEvaluationRequest("x".repeat(MAX_EVALUATION_SOURCE_BYTES + 1), questions),
    ).toThrow("Jev evaluation limit");
    expect(() => buildEvaluationRequest(" ", questions)).toThrow("blank");
  });
  it("evaluates all questions in one request and returns only complete answers", async () => {
    let active = 0;
    const decide = vi.fn(async (input) => {
      active++;
      expect(active).toBe(1);
      await Promise.resolve();
      active--;
      return answer(input);
    });
    const result = await evaluatePricing("x".repeat(24_000), questions, decide);
    expect(decide.mock.calls.length).toBe(1);
    expect(Object.keys(decide.mock.calls[0]![0].questions)).toHaveLength(questions.length);
    expect(result.model).toBe("jev-1.13.0");
    expect(result.answers.map((item) => item.key)).toEqual(questions.map((item) => item.key));
  });
  it("propagates provider failures without partial results", async () => {
    await expect(
      evaluatePricing("x".repeat(70_000), questions, async () => {
        throw new Error("max_tokens_exceeded");
      }),
    ).rejects.toThrow("max_tokens_exceeded");
  });
  it("rejects missing answers in the single response", async () => {
    await expect(
      evaluatePricing("x".repeat(24_000), questions, async (input) => ({
        model: "jev-1.13.0",
        answers: { [questions[0]!.key]: answer(input).answers[questions[0]!.key] },
      })),
    ).rejects.toThrow();
  });
});
