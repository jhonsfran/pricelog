import {
  PRICING_CHOICE_CATALOG,
  PRICING_INTELLIGENCE_RUBRIC_ID,
  PRICING_INTELLIGENCE_RUBRIC_VERSION,
  PRICING_SIGNAL_CATALOG,
  PRICING_PAGE_SCOPE,
  PRICING_RUBRIC_FINGERPRINT,
  CHOICE_CONFIDENCE_THRESHOLD,
  TAG_PROBABILITY_THRESHOLD,
  NOT_ESTABLISHED_PROBABILITY_THRESHOLD,
} from "@my-better-t-app/db/pricing-intelligence";
import {
  FACT_EXTRACTION_FINGERPRINT,
  FACT_CONFIDENCE,
  FACT_EVIDENCE_PROBABILITY,
  PRICING_FACTS_VERSION,
  NUMERIC_FACT_ROLES,
} from "@my-better-t-app/db/pricing-facts";
import { EXPECTED_JEV_MODEL } from "@my-better-t-app/db/measurement-policy";

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

/** The identifier covers questions, thresholds, model, and fact schema version. */
export function rubricContract(questions: unknown = PRICING_INTELLIGENCE_RUBRIC.questions) {
  return {
    version: PRICING_INTELLIGENCE_RUBRIC_VERSION,
    model: EXPECTED_JEV_MODEL,
    scope: PRICING_PAGE_SCOPE,
    questions,
    facts: {
      implementation: FACT_EXTRACTION_FINGERPRINT,
      version: PRICING_FACTS_VERSION,
      roles: NUMERIC_FACT_ROLES,
      confidence: FACT_CONFIDENCE,
      evidence: FACT_EVIDENCE_PROBABILITY,
    },
    publication: {
      choice: CHOICE_CONFIDENCE_THRESHOLD,
      stated: TAG_PROBABILITY_THRESHOLD,
      notEstablished: NOT_ESTABLISHED_PROBABILITY_THRESHOLD,
    },
  };
}
export async function rubricFingerprint(contract: unknown = rubricContract()) {
  const bytes = new TextEncoder().encode(JSON.stringify(contract));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
export async function assertCurrentRubricFingerprint() {
  if ((await rubricFingerprint()) !== PRICING_RUBRIC_FINGERPRINT)
    throw new Error(
      "Pricing rubric contract changed. Update its fingerprint and re-evaluate captures before publication.",
    );
}
