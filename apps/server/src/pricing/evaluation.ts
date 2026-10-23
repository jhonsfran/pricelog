import {
  JEV_CHOICE_KEYS,
  JEV_CHOICE_RULES,
  PRICING_CHOICE_CATALOG,
  PRICING_SIGNAL_CATALOG,
  TAG_PROBABILITY_THRESHOLD,
  type PricingSignalKey,
} from "@pricelog/db/pricing-intelligence";
import type { PageChoice, PageSignal } from "@pricelog/db/schema/pages";
import { deriveProfile, type PublishedSnapshot } from "@pricelog/db/pricing-snapshot";

import type { JevAnswer } from "./types";

import type { PublicEvaluation } from "@pricelog/db/history-types";
export type { PublicEvaluation } from "@pricelog/db/history-types";

/**
 * The page profile: Jev's answers (product category and the monetization questions) plus the
 * fields that follow from the published snapshot. Derived fields are certain, so they carry 1
 * or 0. A Jev answer below its threshold, or one saying the page does not state it, is absent.
 */
export function buildPublicEvaluation(
  answers: JevAnswer[],
  snapshot?: PublishedSnapshot,
): PublicEvaluation {
  const byKey = new Map(answers.map((answer) => [answer.key, answer]));
  const choices: PageChoice[] = JEV_CHOICE_KEYS.flatMap((key) => {
    const answer = byKey.get(key);
    const rule = JEV_CHOICE_RULES[key];
    return answer?.type === "choice" &&
      answer.confidence >= rule.threshold &&
      !rule.absent.includes(answer.choice) &&
      Object.hasOwn(PRICING_CHOICE_CATALOG[key].options, answer.choice)
      ? [
          {
            key,
            choice: answer.choice,
            confidence: answer.confidence,
            probabilities: answer.probabilities,
          },
        ]
      : [];
  });
  const signals: PageSignal[] = [];
  if (snapshot?.status === "collected") {
    const { price_disclosure, ...derived } = deriveProfile(snapshot);
    choices.push({
      key: "price_disclosure",
      choice: price_disclosure,
      confidence: 1,
      probabilities: { [price_disclosure]: 1 },
    });
    for (const [key, stated] of Object.entries(derived))
      signals.push({ key: key as PricingSignalKey, probability: stated ? 1 : 0 });
  }
  const tags = signals
    .filter((signal) => signal.probability >= TAG_PROBABILITY_THRESHOLD)
    .sort(
      (left, right) =>
        PRICING_SIGNAL_CATALOG[left.key].priority - PRICING_SIGNAL_CATALOG[right.key].priority,
    )
    .map((signal) => PRICING_SIGNAL_CATALOG[signal.key].tag);
  return { choices, signals, tags };
}
