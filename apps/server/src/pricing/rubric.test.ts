import { URL } from "node:url";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { FACT_EXTRACTION_FINGERPRINT } from "@my-better-t-app/db/pricing-facts";
import { describe, expect, it } from "vitest";
import {
  AI_APPLICATION_CATEGORY_OPTIONS,
  PRICING_CHOICE_CATALOG,
  PRICING_SIGNAL_CATALOG,
  CHARGING_SIGNAL_KEYS,
  PRACTICE_CHOICE_KEYS,
  PRICING_PAGE_SCOPE,
  PRICING_INTELLIGENCE_RUBRIC_ID,
  PRICING_RUBRIC_FINGERPRINT,
} from "@my-better-t-app/db/pricing-intelligence";
import { PRICING_INTELLIGENCE_RUBRIC, rubricFingerprint, rubricContract } from "./rubric";

describe("pricing practices rubric", () => {
  const rubric = PRICING_INTELLIGENCE_RUBRIC;
  it("asks only Choice and Noul questions in v6", () => {
    expect(rubric.id).toBe(PRICING_INTELLIGENCE_RUBRIC_ID);
    expect(rubric.version).toBe(6);
    expect(new Set(Object.values(rubric.questions).map((q) => q.type))).toEqual(
      new Set(["choice", "noul"]),
    );
    expect(rubric.questions).not.toHaveProperty("plan_count");
    expect(rubric.questions).not.toHaveProperty("annual_commitment_discount");
    expect(rubric.questions).not.toHaveProperty("cost_predictability");
    for (const key of [
      "primary_pricing_model",
      "value_metric",
      "expansion_path",
      "ai_cost_passthrough",
    ])
      expect(rubric.questions).not.toHaveProperty(key);
  });
  it("requires a new fingerprint when the measurement contract changes", async () => {
    expect(await rubricFingerprint()).toBe(PRICING_RUBRIC_FINGERPRINT);
    expect(await rubricFingerprint({ ...rubricContract(), model: "changed" })).not.toBe(
      PRICING_RUBRIC_FINGERPRINT,
    );
    expect(await rubricFingerprint(rubricContract({ changed: true }))).not.toBe(
      PRICING_RUBRIC_FINGERPRINT,
    );
  });
  it("offers eight distinct application tasks and a separate model API category", () => {
    expect(Object.keys(AI_APPLICATION_CATEGORY_OPTIONS)).toEqual([
      "coding_assistants",
      "app_builders",
      "customer_support_agents",
      "voice_agents",
      "video_generation",
      "workflow_agent_builders",
      "sales_prospecting",
      "meeting_assistants",
    ]);
    expect(Object.keys(rubric.questions.product_category.criteria)).toHaveLength(12);
    expect(rubric.questions.product_category.instructions).toContain("Select one category");
    expect(rubric.questions.product_category.instructions).toContain(
      "Do not infer purpose from the company name",
    );
    expect(rubric.questions.product_category.criteria.app_builders).toContain(
      "natural-language prompts",
    );
    expect(rubric.questions.product_category.criteria.customer_support_agents).toContain(
      "Choose this over voice_agents",
    );
    expect(rubric.questions.product_category.criteria.workflow_agent_builders).toContain(
      "Choose a more specific task category",
    );
  });
  it("keeps all six charging components independent", () => {
    expect(CHARGING_SIGNAL_KEYS).toHaveLength(6);
    for (const key of CHARGING_SIGNAL_KEYS) expect(rubric.questions[key].type).toBe("noul");
    expect(rubric.questions.product_category.type).toBe("choice");
  });
  it("separates policy disclosure, applicability, mixed offers, and uncertainty", () => {
    expect(PRACTICE_CHOICE_KEYS).toHaveLength(7);
    for (const key of PRACTICE_CHOICE_KEYS) {
      for (const option of ["not_disclosed", "not_applicable", "varies_by_offer", "unknown"]) {
        expect(rubric.questions[key].criteria).toHaveProperty(option);
      }
    }
  });
  it("derives every prompt from the active public catalog", () => {
    expect(Object.keys(rubric.questions).sort()).toEqual(
      [...Object.keys(PRICING_CHOICE_CATALOG), ...Object.keys(PRICING_SIGNAL_CATALOG)].sort(),
    );
    for (const [key, entry] of Object.entries(PRICING_CHOICE_CATALOG)) {
      const question = rubric.questions[key as keyof typeof PRICING_CHOICE_CATALOG];
      expect(question.instructions).toBe(`${PRICING_PAGE_SCOPE} ${entry.question}`);
      expect(question.criteria).toEqual(entry.options);
    }
    for (const [key, entry] of Object.entries(PRICING_SIGNAL_CATALOG)) {
      const question = rubric.questions[key as keyof typeof PRICING_SIGNAL_CATALOG];
      expect(question.instructions).toBe(`${PRICING_PAGE_SCOPE} ${entry.question}`);
      expect(question.criteria).toEqual({ true: entry.whenTrue, false: entry.whenFalse });
    }
  });
});

it("requires a new extraction fingerprint when parsing, prompts, validation or projection changes", () => {
  const files = [
    "pricing-facts.ts",
    "source-candidates.ts",
    "fact-projection.ts",
    "jev-decisions.ts",
  ];
  const hash = createHash("sha256");
  for (const file of files) hash.update(readFileSync(new URL(file, import.meta.url)));
  expect(hash.digest("hex")).toBe(FACT_EXTRACTION_FINGERPRINT);
});
