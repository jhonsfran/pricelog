import {
  CHOICE_CONFIDENCE_THRESHOLD,
  isPricingChoiceKey,
  isPricingScoreKey,
  isPricingSignalKey,
  PRICING_SIGNAL_CATALOG,
  TAG_PROBABILITY_THRESHOLD,
  type PricingChoiceKey,
  type PricingScoreKey,
  type PricingSignalKey,
} from "@my-better-t-app/db/pricing-intelligence";
import type { PageChoice, PageScore, PageSignal } from "@my-better-t-app/db/schema/pages";

import { calculateOverallScore, normalizeJevScore } from "./score";
import type { JevAnswer } from "./types";

export type PublicEvaluation = {
  overallScore: number;
  scores: PageScore[];
  choices: PageChoice[];
  signals: PageSignal[];
  tags: string[];
};

export function buildPublicEvaluation(answers: JevAnswer[]): PublicEvaluation {
  const scores = answers
    .filter(
      (answer): answer is Extract<JevAnswer, { type: "score" }> & { key: PricingScoreKey } =>
        answer.type === "score" && isPricingScoreKey(answer.key),
    )
    .map((answer) => ({
      key: answer.key,
      score: normalizeJevScore(answer.score),
      confidence: answer.confidence,
    }));
  const choices = answers
    .filter(
      (answer): answer is Extract<JevAnswer, { type: "choice" }> & { key: PricingChoiceKey } =>
        answer.type === "choice" && isPricingChoiceKey(answer.key),
    )
    .filter(
      (answer) => answer.confidence >= CHOICE_CONFIDENCE_THRESHOLD && answer.choice !== "unknown",
    )
    .map((answer) => ({
      key: answer.key,
      choice: answer.choice,
      confidence: answer.confidence,
      probabilities: answer.probabilities,
    }));
  const signals = answers
    .filter(
      (answer): answer is Extract<JevAnswer, { type: "noul" }> & { key: PricingSignalKey } =>
        answer.type === "noul" && isPricingSignalKey(answer.key),
    )
    .map((answer) => ({ key: answer.key, probability: answer.noul }));
  const tags = signals
    .filter((signal) => signal.probability >= TAG_PROBABILITY_THRESHOLD)
    .sort(
      (left, right) =>
        PRICING_SIGNAL_CATALOG[left.key].priority - PRICING_SIGNAL_CATALOG[right.key].priority,
    )
    .map((signal) => PRICING_SIGNAL_CATALOG[signal.key].tag);

  return {
    overallScore: calculateOverallScore(scores.map((score) => score.score)),
    scores,
    choices,
    signals,
    tags,
  };
}
