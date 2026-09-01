import { requireJevModelVersion, type Decide } from "./change-verification";
import { parseJevAnswers } from "./scan-workflow-logic";
import type { PersistedQuestion } from "./types";

// Jev 1.13 accepts 64k tokens for the complete request and 32k tokens for the
// state plus the longest question. The Worker does not have Jev's tokenizer,
// so keep a conservative UTF-8 byte budget instead of pretending bytes are
// tokens. This leaves room for the full rubric and the structured response.
export const MAX_EVALUATION_SOURCE_BYTES = 72 * 1024;
export const MAX_EVALUATION_REQUEST_BYTES = 192 * 1024;
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

/** Jev evaluates every question against the same state in one request. */
export function buildEvaluationRequest(source: string, questions: PersistedQuestion[]) {
  if (!source.trim()) throw new Error("Pricing source is blank");
  const sourceBytes = byteLength(source);
  if (sourceBytes > MAX_EVALUATION_SOURCE_BYTES) {
    throw new Error(
      `Pricing source exceeds the Jev evaluation limit (${sourceBytes} bytes > ${MAX_EVALUATION_SOURCE_BYTES}); partial-source disclosure findings are not published`,
    );
  }
  if (!questions.length) throw new Error("Pricing rubric has no questions");
  const input = request(source, questions);
  const requestBytes = byteLength(JSON.stringify(input));
  if (requestBytes > MAX_EVALUATION_REQUEST_BYTES) {
    throw new Error(
      `Pricing evaluation request exceeds the safe transport limit (${requestBytes} bytes > ${MAX_EVALUATION_REQUEST_BYTES})`,
    );
  }
  return { input, questions };
}

/** No answers leave this function until the complete request passes validation. */
export async function evaluatePricing(
  source: string,
  questions: PersistedQuestion[],
  decide: Decide,
) {
  const evaluation = buildEvaluationRequest(source, questions);
  const response = await decide(evaluation.input);
  const model = requireJevModelVersion(response);
  const answers = parseJevAnswers(response, evaluation.questions);
  return { model, answers };
}
