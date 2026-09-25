import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { captureShas, loadCapture } from "./captures";
import { createDecide } from "./jev";
import {
  EXPERIMENTS_LOG,
  GOLD_DIR,
  RUNS_DIR,
  REPO_ROOT,
  appendJsonl,
  fingerprint,
  flag,
  readJson,
  sha256,
  writeJson,
} from "./lab";
import type { Gold, LabResult } from "./schema";
import { diffResults, scoreResult, type Score } from "./score";
import { VARIANTS } from "./variants";

const variantId = flag("variant") ?? "names-v16a";
const domain = flag("domain") ?? "cursor.com";
const useCache = flag("no-cache") !== "true";
const note = flag("note") ?? "";
const variant = VARIANTS[variantId];
if (!variant) throw new Error(`Unknown variant ${variantId}`);

const print = flag("print") === "true";
const id = fingerprint(variant.files, { ...variant.settings, model: "jev-1.13.0" });
const results: LabResult[] = [];
const scores: { capture: string; score: Score | null; gold: string | null }[] = [];

for (const sha of captureShas(domain)) {
  const capture = loadCapture(sha);
  const { decide, stats } = createDecide({ cache: useCache });
  const started = Date.now();
  const extracted = await variant.extract(capture, decide);
  const result: LabResult = {
    ...extracted,
    variant: variant.id,
    fingerprint: id,
    capture: sha,
    jev: { ...stats, ms: Date.now() - started },
  };
  results.push(result);
  writeJson(join(RUNS_DIR, variant.id, `${sha}.json`), result);
  const goldPath = join(GOLD_DIR, `${sha}.json`);
  const gold = existsSync(goldPath) ? readJson<Gold>(goldPath) : null;
  const score = gold ? scoreResult(result, gold, capture.markdown) : null;
  scores.push({ capture: sha, score, gold: gold ? sha256(JSON.stringify(gold)) : null });

  const tokensPerByte = capture.markdown.length ? result.jev.inputTokens / capture.bytes : 0;
  console.log(
    `\n${variant.id} ${sha.slice(0, 12)} ${result.status}${result.reason ? ` (${result.reason})` : ""}`,
  );
  console.log(
    `  jev: ${result.jev.requests} requests (${result.jev.sent} sent), ${result.jev.inputTokens} input tokens, ${(tokensPerByte * 4).toFixed(2)}x page (≈4 B/token), ${result.jev.ms} ms`,
  );
  if (score)
    console.log(
      `  precision ${score.precision === null ? "n/a" : score.precision.toFixed(2)} | recall ${score.recall.toFixed(2)} (any ${score.recallAny.toFixed(2)}, numeric ${score.recallNumeric.toFixed(2)}) | fields ${score.fieldCompleteness.toFixed(2)} | accepted ${score.accepted}, wrong ${score.wrong}, dup ${score.duplicates}, unattributed ${score.unattributed} | missed ${score.missed.join(",") || "-"}`,
    );
  for (const verdict of score?.verdicts ?? [])
    if (print || verdict.verdict !== "correct")
      console.log(
        `    ${verdict.verdict.padEnd(20)} ${verdict.fact.plan ?? "∅"} ${verdict.fact.role} ${verdict.fact.amount ?? ""} ${verdict.fact.unit ?? ""} ${verdict.fact.currency ?? ""} ${verdict.fact.billing}/${verdict.fact.period} ${verdict.reasons.join("; ")}${verdict.missingFields.length ? ` [missing ${verdict.missingFields.join(",")}]` : ""}`,
      );
  if (print && !score)
    for (const fact of result.facts)
      console.log(
        `    ${fact.plan ?? "∅"} ${fact.role} ${fact.amount ?? ""} ${fact.unit ?? ""} ${fact.currency ?? ""} ${fact.billing}/${fact.period} «${fact.evidence.text.slice(0, 60)}»`,
      );
}

const changes = results.length > 1 ? diffResults(results[0]!, results.at(-1)!) : null;
if (changes) console.log("\nchanges first→last:", JSON.stringify(changes));

const scored = scores.filter((item) => item.score);
const mean = (pick: (score: Score) => number | null) => {
  const values = scored.map((item) => pick(item.score!)).filter((value) => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
};
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT }).toString().trim();
appendJsonl(EXPERIMENTS_LOG, {
  at: new Date().toISOString(),
  variant: variant.id,
  parent: variant.parent,
  fingerprint: id,
  hypothesis: variant.hypothesis,
  settings: variant.settings,
  domain,
  commit,
  cache: useCache,
  captures: scores.map((item) => ({
    capture: item.capture,
    gold: item.gold,
    ...(item.score
      ? {
          precision: item.score.precision,
          recall: item.score.recall,
          recallAny: item.score.recallAny,
          recallNumeric: item.score.recallNumeric,
          fieldCompleteness: item.score.fieldCompleteness,
          accepted: item.score.accepted,
          wrong: item.score.wrong,
          duplicates: item.score.duplicates,
          missed: item.score.missed,
        }
      : {}),
  })),
  summary: {
    precision: mean((score) => score.precision),
    recall: mean((score) => score.recall),
    requests: results.reduce((sum, result) => sum + result.jev.requests, 0),
    inputTokens: results.reduce((sum, result) => sum + result.jev.inputTokens, 0),
    captureBytes: results.reduce((sum, result) => sum + loadCapture(result.capture).bytes, 0),
    unavailable: results.filter((result) => result.status === "unavailable").length,
  },
  changes,
  note,
});
