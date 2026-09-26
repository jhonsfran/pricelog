import {
  MAX_EVALUATION_REQUEST_BYTES,
  requireJevModelVersion,
  type Decide,
} from "./evaluation-request";
import { parseJevAnswers } from "./scan-workflow-logic";
import type { JevAnswer, PersistedQuestion } from "./types";

export function choiceQuestion(
  key: string,
  instructions: string,
  criteria: Record<string, string>,
): PersistedQuestion {
  if (Object.keys(criteria).length > 255) throw new Error("Jev Choice exceeds 255 options");
  return { key, type: "choice", instructions, criteria, position: 0, minimum: null, maximum: null };
}
export function evidenceQuestion(key: string, instructions: string): PersistedQuestion {
  return {
    key,
    type: "noul",
    instructions,
    criteria: {
      true: "The captured source explicitly supports this claim.",
      false: "The claim is missing, ambiguous, contradictory, or belongs to another offer.",
    },
    position: 0,
    minimum: null,
    maximum: null,
  };
}
export function chosen(answers: JevAnswer[], key: string, threshold = 0.9) {
  const answer = answers.find((item) => item.key === key);
  return answer?.type === "choice" && answer.confidence >= threshold && answer.choice !== "unknown"
    ? answer
    : null;
}

/** Only independent questions share a call. Dependent selections use the next call. */
export function jevDecisions(decide: Decide) {
  let model: string | null = null;
  let requests = 0;
  return {
    get model() {
      return model;
    },
    async run(state: unknown, questions: PersistedQuestion[]): Promise<JevAnswer[]> {
      const serialized = typeof state === "string" ? state : JSON.stringify(state);
      if (new TextEncoder().encode(serialized).byteLength > 96 * 1024)
        throw new Error("Jev fact state exceeds transport byte limit");
      const answers: JevAnswer[] = [];
      for (let offset = 0; offset < questions.length;) {
        let batch = questions.slice(offset, offset + 64);
        const request = () => ({
          state: serialized,
          questions: Object.fromEntries(
            batch.map(({ key, type, instructions, criteria }) => [
              key,
              { type, instructions, criteria },
            ]),
          ),
        });
        let input = request();
        while (
          batch.length > 1 &&
          new TextEncoder().encode(JSON.stringify(input)).byteLength > MAX_EVALUATION_REQUEST_BYTES
        ) {
          batch = batch.slice(0, Math.ceil(batch.length / 2));
          input = request();
        }
        if (
          new TextEncoder().encode(JSON.stringify(input)).byteLength > MAX_EVALUATION_REQUEST_BYTES
        )
          throw new Error("Jev fact request exceeds transport byte limit");
        if (++requests > 128) throw new Error("Jev fact request limit exceeded");
        const response = await decide(input);
        const current = requireJevModelVersion(response);
        if (model && current !== model)
          throw new Error("Jev model version changed during collection");
        model = current;
        answers.push(...parseJevAnswers(response, batch));
        offset += batch.length;
      }
      return answers;
    },
  };
}
