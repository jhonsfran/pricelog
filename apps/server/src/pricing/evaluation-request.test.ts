import { describe, expect, it, vi } from "vitest";
import {
  buildEvaluationBatches,
  evaluatePricing,
  MAX_EVALUATION_SOURCE_BYTES,
  MAX_EVALUATION_REQUEST_BYTES,
  EVALUATION_BATCH_SIZE,
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
    "batches the real rubric while preserving all source and questions",
    (source) => {
      const batches = buildEvaluationBatches(source, questions);
      expect(batches.length).toBeGreaterThan(1);
      expect(batches.every((batch) => batch.questions.length <= EVALUATION_BATCH_SIZE)).toBe(true);
      expect(
        batches.every(
          ({ input }) =>
            input.state === source &&
            new TextEncoder().encode(JSON.stringify(input)).byteLength <=
              MAX_EVALUATION_REQUEST_BYTES,
        ),
      ).toBe(true);
      expect(batches.flatMap((batch) => batch.questions)).toEqual(questions);
      expect(buildEvaluationBatches(source, questions)).toEqual(batches);
    },
  );
  it("rejects a question that cannot fit without truncation", () => {
    expect(() =>
      buildEvaluationBatches("x".repeat(24_000), [
        {
          ...questions[0]!,
          instructions: "x".repeat(MAX_EVALUATION_REQUEST_BYTES),
        },
      ]),
    ).toThrow("transport byte limit");
    expect(() =>
      buildEvaluationBatches("界".repeat(Math.ceil(MAX_EVALUATION_SOURCE_BYTES / 3)), questions),
    ).toThrow("transport byte limit");
  });
  it("enforces the source byte limit without truncation", () => {
    expect(() =>
      buildEvaluationBatches("x".repeat(MAX_EVALUATION_SOURCE_BYTES + 1), questions),
    ).toThrow("transport byte limit");
    expect(() => buildEvaluationBatches(" ", questions)).toThrow("blank");
  });
  it("evaluates sequentially and combines only complete answers", async () => {
    let active = 0;
    const decide = vi.fn(async (input) => {
      active++;
      expect(active).toBe(1);
      await Promise.resolve();
      active--;
      return answer(input);
    });
    const result = await evaluatePricing("x".repeat(24_000), questions, decide);
    expect(decide.mock.calls.length).toBeGreaterThan(1);
    expect(result.model).toBe("jev-1.13.0");
    expect(result.answers.map((item) => item.key)).toEqual(questions.map((item) => item.key));
  });
  it("rejects model version changes across batches", async () => {
    let calls = 0;
    await expect(
      evaluatePricing("x".repeat(24_000), questions, async (input) =>
        answer(input, ++calls === 1 ? "jev-1.13.0" : "jev-1.14.0"),
      ),
    ).rejects.toThrow("model version changed");
  });
  it("propagates provider token-limit failures without partial results", async () => {
    let calls = 0;
    await expect(
      evaluatePricing("x".repeat(70_000), questions, async (input) => {
        if (++calls === 2) throw new Error("max_tokens_exceeded");
        return answer(input);
      }),
    ).rejects.toThrow("max_tokens_exceeded");
  });
  it("rejects missing answers in a later batch", async () => {
    let calls = 0;
    await expect(
      evaluatePricing("x".repeat(24_000), questions, async (input) =>
        ++calls === 1 ? answer(input) : { model: "jev-1.13.0", answers: {} },
      ),
    ).rejects.toThrow();
  });
});
