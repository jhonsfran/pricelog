import {
  PRICING_CHOICE_CATALOG,
  PRICING_INTELLIGENCE_RUBRIC_ID,
  PRICING_INTELLIGENCE_RUBRIC_VERSION,
  PRICING_SCORE_CATALOG,
  PRICING_SIGNAL_CATALOG,
  type PricingIntelligenceQuestionKey,
} from "@my-better-t-app/db/pricing-intelligence";

type ScoreQuestion = {
  type: "score";
  instructions: string;
  criteria: readonly string[];
};

type ChoiceQuestion = {
  type: "choice";
  instructions: string;
  criteria: Readonly<Record<string, string>>;
};

type NoulQuestion = {
  type: "noul";
  instructions: string;
  criteria: { true: string; false: string };
};

type RubricQuestion = ScoreQuestion | ChoiceQuestion | NoulQuestion;

/** Maps a catalog to questions while keeping each literal key in the result type. */
function mapCatalog<Key extends string, Entry, Question>(
  catalog: Record<Key, Entry>,
  build: (entry: Entry) => Question,
): Record<Key, Question> {
  const questions = {} as Record<Key, Question>;
  for (const key of Object.keys(catalog) as Key[]) {
    questions[key] = build(catalog[key]);
  }
  return questions;
}

/**
 * Every question is derived from the shared catalog rather than restated here,
 * so the text Jev evaluates is byte-identical to the methodology Pricelog
 * publishes. Adding a question to the catalog adds it to the prompt.
 */
const scoreQuestions = mapCatalog(PRICING_SCORE_CATALOG, (entry): ScoreQuestion => ({
  type: "score",
  instructions: entry.question,
  criteria: entry.criteria,
}));

const choiceQuestions = mapCatalog(PRICING_CHOICE_CATALOG, (entry): ChoiceQuestion => ({
  type: "choice",
  instructions: entry.question,
  criteria: entry.options,
}));

const noulQuestions = mapCatalog(PRICING_SIGNAL_CATALOG, (entry): NoulQuestion => ({
  type: "noul",
  instructions: entry.question,
  criteria: { true: entry.whenTrue, false: entry.whenFalse },
}));

export const PRICING_INTELLIGENCE_V3 = {
  id: PRICING_INTELLIGENCE_RUBRIC_ID,
  version: PRICING_INTELLIGENCE_RUBRIC_VERSION,
  model: "typesafe/jev",
  questions: {
    ...scoreQuestions,
    ...choiceQuestions,
    ...noulQuestions,
  } satisfies Record<PricingIntelligenceQuestionKey, RubricQuestion>,
} as const;
