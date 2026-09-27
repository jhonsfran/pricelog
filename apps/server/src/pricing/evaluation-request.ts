import { EXPECTED_JEV_MODEL } from "@pricelog/db/measurement-policy";

// Jev 1.13 accepts 64k tokens for the complete request and 32k tokens for the
// state plus the longest question. The Worker does not have Jev's tokenizer,
// so keep a conservative UTF-8 byte budget instead of pretending bytes are
// tokens. This leaves room for the full rubric and the structured response.
export const MAX_EVALUATION_SOURCE_BYTES = 72 * 1024;
export const MAX_EVALUATION_REQUEST_BYTES = 192 * 1024;

type DecisionRequest = { state: string; questions: Record<string, unknown> };
export type Decide = (input: DecisionRequest) => Promise<unknown>;

export function jevModelVersion(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const payload = "result" in response ? response.result : response;
  if (!payload || typeof payload !== "object" || !("model" in payload)) return null;
  return typeof payload.model === "string" && /jev[-/]\d/.test(payload.model)
    ? payload.model
    : null;
}

export function requireJevModelVersion(response: unknown): string {
  const model = jevModelVersion(response);
  if (!model) throw new Error("Jev returned no exact provider model version");
  if (model !== EXPECTED_JEV_MODEL)
    throw new Error(`Unapproved Jev model ${model}; expected ${EXPECTED_JEV_MODEL}`);
  return model;
}
