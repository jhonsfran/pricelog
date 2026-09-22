import {
  CHOICE_CONFIDENCE_THRESHOLD,
  isPricingChoiceKey,
  isPricingSignalKey,
  PRICING_SIGNAL_CATALOG,
  PRICING_CHOICE_CATALOG,
  TAG_PROBABILITY_THRESHOLD,
  type PricingChoiceKey,
  type PricingSignalKey,
} from "@my-better-t-app/db/pricing-intelligence";
import type { PageChoice, PageSignal } from "@my-better-t-app/db/schema/pages";
import type { NumericPrices } from "@my-better-t-app/db/numeric-prices";

import type { JevAnswer } from "./types";

export type PublicEvaluation = {
  choices: PageChoice[];
  signals: PageSignal[];
  tags: string[];
  numericPrices?: NumericPrices;
};

export function buildPublicEvaluation(answers: JevAnswer[]): PublicEvaluation {
  const choices = answers
    .filter(
      (answer): answer is Extract<JevAnswer, { type: "choice" }> & { key: PricingChoiceKey } =>
        answer.type === "choice" && isPricingChoiceKey(answer.key),
    )
    .filter(
      (answer) =>
        answer.confidence >= CHOICE_CONFIDENCE_THRESHOLD &&
        answer.choice !== "unknown" &&
        Object.hasOwn(PRICING_CHOICE_CATALOG[answer.key].options, answer.choice),
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
    choices,
    signals,
    tags,
  };
}
