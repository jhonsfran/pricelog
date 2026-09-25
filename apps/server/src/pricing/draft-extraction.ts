import type { DraftFeature } from "@my-better-t-app/db/pricing-snapshot";
import {
  DRAFT_RECOVERY_PARTS,
  draftSnapshotSchema,
  normalizeRecoveryDraft,
} from "./draft-snapshot";
import { MAX_EVALUATION_SOURCE_BYTES } from "./evaluation-request";

export const QWEN_DRAFT_MODEL = "workers-ai/@cf/qwen/qwen3-30b-a3b-fp8";
export const LLAMA_DRAFT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const MAX_DRAFT_SOURCE_BYTES = MAX_EVALUATION_SOURCE_BYTES;
const MAX_QWEN_CONTEXT_BYTES = 10 * 1024;
const MAX_QWEN_FEATURE_BYTES = 6 * 1024;

export type DraftPart = (typeof DRAFT_RECOVERY_PARTS)[number];

const partValidators = {
  profile: draftSnapshotSchema.pick({
    buying_motion: true,
    price_disclosure: true,
    primary_customer_segment: true,
    primary_market: true,
    product_category: true,
    billing_view: true,
    currency_visible: true,
  }),
  flags: draftSnapshotSchema.pick({ flags: true }),
  offers: draftSnapshotSchema.pick({ offers: true }),
  features: draftSnapshotSchema.pick({ features: true }),
};

export function limitDraftSource(markdown: string): string {
  const bytes = new TextEncoder().encode(markdown);
  if (bytes.byteLength <= MAX_DRAFT_SOURCE_BYTES) return markdown;
  const clipped = new TextDecoder().decode(bytes.slice(0, MAX_DRAFT_SOURCE_BYTES));
  return clipped.slice(0, clipped.lastIndexOf("\n")).trimEnd();
}

/** Keep each model request small while retaining every line in the bounded source. */
export function draftSourceChunks(markdown: string, part: DraftPart): string[] {
  const limit = part.name === "features" ? MAX_QWEN_FEATURE_BYTES : MAX_QWEN_CONTEXT_BYTES;
  const chunks: string[] = [];
  let chunk = "";
  let bytes = 0;
  for (const line of markdown.split("\n")) {
    const text = `${line}\n`;
    const lineBytes = new TextEncoder().encode(text).byteLength;
    if (bytes && bytes + lineBytes > limit) {
      chunks.push(chunk.trimEnd());
      chunk = "";
      bytes = 0;
    }
    if (lineBytes > limit) {
      for (const character of text) {
        const size = new TextEncoder().encode(character).byteLength;
        if (bytes + size > limit) {
          chunks.push(chunk.trimEnd());
          chunk = "";
          bytes = 0;
        }
        chunk += character;
        bytes += size;
      }
      continue;
    }
    chunk += text;
    bytes += lineBytes;
  }
  if (chunk.trim()) chunks.push(chunk.trimEnd());
  return part.name === "features" ? chunks : chunks.slice(0, 1);
}

export function markdownExcerptHtml(markdown: string): string {
  const escaped = markdown.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `<html><body><main><pre>${escaped}</pre></main></body></html>`;
}

/** A part must satisfy its own contract before it can enter the merged draft. */
export function parseDraftPart(payload: unknown, part: DraftPart): Record<string, unknown> {
  if (payload && typeof payload === "object" && "success" in payload && payload.success !== true)
    throw new Error("Provider reported failure");
  let result: unknown =
    payload && typeof payload === "object" && "result" in payload ? payload.result : payload;
  if (result && typeof result === "object" && "choices" in result) {
    const choice = Array.isArray(result.choices) ? result.choices[0] : null;
    if (choice?.finish_reason !== "stop" || typeof choice?.message?.content !== "string")
      throw new Error("Model did not complete its JSON response");
    result = choice.message.content;
  }
  if (typeof result === "string") result = JSON.parse(result);
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new Error(`Model returned an invalid ${part.name} object`);
  const record = result as Record<string, unknown>;
  const normalized = normalizeRecoveryDraft(record);
  const fields = Object.fromEntries(part.keys.map((key) => [key, normalized.value[key]]));
  const parsed = partValidators[part.name].safeParse(fields);
  if (!parsed.success)
    throw new Error(
      `Invalid ${part.name} draft: ${parsed.error.issues
        .slice(0, 4)
        .map((issue) => `${issue.path.join(".") || "root"}: ${issue.code}`)
        .join(", ")}`,
    );
  return parsed.data;
}

export function mergeFeatureParts(parts: unknown[]): DraftFeature[] {
  const features = new Map<string, DraftFeature>();
  for (const part of parts) {
    const parsed = draftSnapshotSchema.shape.features.safeParse(
      normalizeRecoveryDraft({ features: part }).value.features,
    );
    if (!parsed.success) throw new Error("Feature chunk failed validation");
    for (const feature of parsed.data) {
      const key = feature.name.toLowerCase();
      const current = features.get(key);
      if (!current) {
        features.set(key, structuredClone(feature));
        continue;
      }
      for (const cell of feature.availability) {
        const previous = current.availability.find(
          (item) => item.offer.toLowerCase() === cell.offer.toLowerCase(),
        );
        if (!previous) {
          current.availability.push(cell);
          continue;
        }
        if (previous.status !== cell.status) previous.status = "unknown";
        if (previous.limit_raw !== cell.limit_raw) previous.limit_raw = null;
      }
    }
  }
  return [...features.values()];
}
