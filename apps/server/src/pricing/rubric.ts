import {
  JEV_CHOICE_KEYS,
  JEV_CHOICE_RULES,
  PRICING_CHOICE_CATALOG,
  PRICING_INTELLIGENCE_RUBRIC_ID,
  PRICING_INTELLIGENCE_RUBRIC_VERSION,
  PRICING_PAGE_SCOPE,
  PRICING_RUBRIC_FINGERPRINT,
} from "@pricelog/db/pricing-intelligence";
import { EXPECTED_JEV_MODEL } from "@pricelog/db/measurement-policy";

type ChoiceQuestion = {
  type: "choice";
  instructions: string;
  criteria: Readonly<Record<string, string>>;
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
 * Jev answers only the profile questions the catalog marks as Jev's; every other profile field
 * is derived from the published snapshot. The text Jev evaluates is byte-identical to the
 * methodology Pricelog publishes.
 */
const profileCatalog = Object.fromEntries(
  JEV_CHOICE_KEYS.map((key) => [key, PRICING_CHOICE_CATALOG[key]]),
) as Pick<typeof PRICING_CHOICE_CATALOG, (typeof JEV_CHOICE_KEYS)[number]>;
const choiceQuestions = mapCatalog(profileCatalog, (entry): ChoiceQuestion => ({
  type: "choice",
  instructions: `${PRICING_PAGE_SCOPE} ${entry.question}`,
  criteria: entry.options,
}));

export const PRICING_INTELLIGENCE_RUBRIC = {
  id: PRICING_INTELLIGENCE_RUBRIC_ID,
  version: PRICING_INTELLIGENCE_RUBRIC_VERSION,
  model: "typesafe/jev",
  scope: PRICING_PAGE_SCOPE,
  questions: choiceQuestions,
} as const;

/**
 * The identifier covers only what Jev's profile answers depend on: questions, scope, model
 * and thresholds. Extraction code has its own PRICING_PIPELINE_ID, so a pipeline change does
 * not make earlier profile answers incomparable.
 */
export function rubricContract(questions: unknown = PRICING_INTELLIGENCE_RUBRIC.questions) {
  return {
    version: PRICING_INTELLIGENCE_RUBRIC_VERSION,
    model: EXPECTED_JEV_MODEL,
    scope: PRICING_PAGE_SCOPE,
    questions,
    publication: JEV_CHOICE_RULES,
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
