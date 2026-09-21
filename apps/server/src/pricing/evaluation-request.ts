import { requireJevModelVersion, type Decide } from "./change-verification";
import { parseJevAnswers } from "./scan-workflow-logic";
import type { JevAnswer, PersistedQuestion } from "./types";

// Transport bounds, not token estimates. Jev enforces its own context limits.
export const MAX_EVALUATION_SOURCE_BYTES = 256 * 1024;
export const MAX_EVALUATION_REQUEST_BYTES = 512 * 1024;
export const EVALUATION_BATCH_SIZE = 8;
const byteLength = (value: string) => new TextEncoder().encode(value).byteLength;

function request(state: string, questions: PersistedQuestion[]) {
  return {
    state,
    questions: Object.fromEntries(
      questions.map(({ key, type, instructions, criteria }) => [
        key,
        { type, instructions, criteria },
      ]),
    ),
  };
}

/** Split questions only. Every request evaluates the entire captured source. */
export function buildEvaluationBatches(source: string, questions: PersistedQuestion[]) {
  if (!source.trim()) throw new Error("Pricing source is blank");
  if (byteLength(source) > MAX_EVALUATION_SOURCE_BYTES) {
    throw new Error(
      "Pricing source exceeds the transport byte limit; partial-source disclosure findings are not published",
    );
  }
  if (!questions.length) throw new Error("Pricing rubric has no questions");
  const batches: { input: ReturnType<typeof request>; questions: PersistedQuestion[] }[] = [];
  for (let offset = 0; offset < questions.length; offset += EVALUATION_BATCH_SIZE) {
    const batchQuestions = questions.slice(offset, offset + EVALUATION_BATCH_SIZE);
    const input = request(source, batchQuestions);
    if (byteLength(JSON.stringify(input)) > MAX_EVALUATION_REQUEST_BYTES) {
      throw new Error("Pricing evaluation batch exceeds the request transport byte limit");
    }
    batches.push({ input, questions: batchQuestions });
  }
  return batches;
}

/** No answers leave this function until all batches pass validation. */
export async function evaluatePricing(
  source: string,
  questions: PersistedQuestion[],
  decide: Decide,
) {
  const batches = buildEvaluationBatches(source, questions);
  const answers: JevAnswer[] = [];
  let model: string | undefined;
  for (const batch of batches) {
    const response = await decide(batch.input);
    const version = requireJevModelVersion(response);
    if (model !== undefined && version !== model) {
      throw new Error("Jev model version changed between pricing evaluation batches");
    }
    model = version;
    answers.push(...parseJevAnswers(response, batch.questions));
  }
  return { model: model!, answers };
}
