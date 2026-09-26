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
  PROFILE_CHOICE_KEYS,
  PROFILE_FLAG_KEYS,
  PRICING_SNAPSHOT_VERSION,
  SNAPSHOT_IMPLEMENTATION_FINGERPRINT,
} from "@my-better-t-app/db/pricing-snapshot";
import { EXTRACTION_MODEL, EXTRACTION_PARTS } from "./quote-snapshot";
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
const profileCatalog = Object.fromEntries(
  PROFILE_CHOICE_KEYS.map((key) => [key, PRICING_CHOICE_CATALOG[key]]),
) as Pick<typeof PRICING_CHOICE_CATALOG, (typeof PROFILE_CHOICE_KEYS)[number]>;
const flagCatalog = Object.fromEntries(
  PROFILE_FLAG_KEYS.map((key) => [key, PRICING_SIGNAL_CATALOG[key]]),
) as Pick<typeof PRICING_SIGNAL_CATALOG, (typeof PROFILE_FLAG_KEYS)[number]>;
const choiceQuestions = mapCatalog(profileCatalog, (entry): ChoiceQuestion => ({
  type: "choice",
  instructions: `${PRICING_PAGE_SCOPE} ${entry.question}`,
  criteria: entry.options,
}));

const noulQuestions = mapCatalog(flagCatalog, (entry): NoulQuestion => ({
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
      version: PRICING_SNAPSHOT_VERSION,
      implementation: SNAPSHOT_IMPLEMENTATION_FINGERPRINT,
      extraction: { model: EXTRACTION_MODEL, parts: EXTRACTION_PARTS },
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
