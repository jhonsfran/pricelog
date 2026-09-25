import { join } from "node:path";
import type { Decide } from "../../src/pricing/change-verification";
import { CACHE_DIR, readJsonIfExists, sha256, writeJson } from "./lab";

/** Requests go through the dev proxy in packages/infra/tmp/fact-lab-jev (Alchemy dev login). */
const ENDPOINT = process.env.FACT_LAB_JEV_URL ?? "http://localhost:4400";

export type JevStats = {
  /** Every request the variant made, cached or not. This is the variant's cost. */
  requests: number;
  inputTokens: number;
  /** Requests actually sent to Jev in this run. */
  sent: number;
  sentInputTokens: number;
  ms: number;
};

type Cached = { result: unknown; ms: number; at: string };

function inputTokens(result: unknown): number {
  const inner =
    result && typeof result === "object" && "result" in result
      ? (result as { result: unknown }).result
      : result;
  const usage = (inner as { usage?: { input_tokens?: number } } | null)?.usage;
  return typeof usage?.input_tokens === "number" ? usage.input_tokens : 0;
}

async function send(body: string): Promise<{ result: unknown; ms: number }> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const json = (await response.json()) as { result?: unknown; error?: string; ms: number };
    if (response.ok && json.result) return { result: json.result, ms: json.ms };
    const message = json.error ?? `HTTP ${response.status}`;
    const transient = /429|529|overload|timeout|network|internal/i.test(message);
    if (!transient || attempt >= 4) throw new Error(`Jev request failed: ${message}`);
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
  }
}

/** A Decide compatible with the production pipeline, with a content-addressed response cache. */
export function createDecide(options: { cache: boolean }) {
  const stats: JevStats = { requests: 0, inputTokens: 0, sent: 0, sentInputTokens: 0, ms: 0 };
  const decide: Decide = async (input) => {
    const body = JSON.stringify(input);
    const path = join(CACHE_DIR, `${sha256(`typesafe/jev\n${body}`)}.json`);
    const cached = options.cache ? readJsonIfExists<Cached>(path) : null;
    stats.requests++;
    if (cached) {
      stats.inputTokens += inputTokens(cached.result);
      return cached.result;
    }
    const { result, ms } = await send(body);
    const tokens = inputTokens(result);
    stats.inputTokens += tokens;
    stats.sent++;
    stats.sentInputTokens += tokens;
    stats.ms += ms;
    writeJson(path, { result, ms, at: new Date().toISOString() } satisfies Cached);
    return result;
  };
  return { decide, stats };
}

/** Run async tasks with bounded concurrency, preserving result order. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}
