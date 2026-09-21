import {
  PRICING_CHOICE_CATALOG,
  PRICING_INTELLIGENCE_RUBRIC_ID,
  PRICING_INTELLIGENCE_RUBRIC_VERSION,
  PRICING_SIGNAL_CATALOG,
  PRICING_PAGE_SCOPE,
} from "@my-better-t-app/db/pricing-intelligence";

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
const choiceQuestions = mapCatalog(PRICING_CHOICE_CATALOG, (entry): ChoiceQuestion => ({
  type: "choice",
  instructions: `${PRICING_PAGE_SCOPE} ${entry.question}`,
  criteria: entry.options,
}));

const noulQuestions = mapCatalog(PRICING_SIGNAL_CATALOG, (entry): NoulQuestion => ({
  type: "noul",
  instructions: `${PRICING_PAGE_SCOPE} ${entry.question}`,
  criteria: { true: entry.whenTrue, false: entry.whenFalse },
}));

export const PRICING_INTELLIGENCE_RUBRIC = {
  id: PRICING_INTELLIGENCE_RUBRIC_ID,
  version: PRICING_INTELLIGENCE_RUBRIC_VERSION,
  model: "typesafe/jev",
  scope: PRICING_PAGE_SCOPE,
  questions: {
    ...choiceQuestions,
    ...noulQuestions,
  },
} as const;
