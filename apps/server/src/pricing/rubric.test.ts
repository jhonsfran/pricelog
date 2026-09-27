import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import {
  PRICING_CHOICE_CATALOG,
  PRICING_SIGNAL_CATALOG,
  PRICING_PAGE_SCOPE,
  PRICING_INTELLIGENCE_RUBRIC_ID,
  PRICING_RUBRIC_FINGERPRINT,
} from "@my-better-t-app/db/pricing-intelligence";
import {
  PRICING_PIPELINE_ID,
  SNAPSHOT_IMPLEMENTATION_FINGERPRINT,
} from "@my-better-t-app/db/pricing-snapshot";
import { PRICING_INTELLIGENCE_RUBRIC, rubricFingerprint, rubricContract } from "./rubric";

describe("pricing rubric", () => {
  const rubric = PRICING_INTELLIGENCE_RUBRIC;

  it("asks Jev only the product category and free trial profile questions", () => {
    expect(rubric.id).toBe(PRICING_INTELLIGENCE_RUBRIC_ID);
    expect(rubric.version).toBe(12);
    expect(Object.keys(rubric.questions)).toEqual(["product_category", "has_free_trial"]);
  });

  it("takes the question text Jev evaluates from the public catalogs", () => {
    const category = PRICING_CHOICE_CATALOG.product_category;
    expect(rubric.questions.product_category.instructions).toBe(
      `${PRICING_PAGE_SCOPE} ${category.question}`,
    );
    expect(rubric.questions.product_category.criteria).toEqual(category.options);
    const trial = PRICING_SIGNAL_CATALOG.has_free_trial;
    expect(rubric.questions.has_free_trial.instructions).toBe(
      `${PRICING_PAGE_SCOPE} ${trial.question}`,
    );
    expect(rubric.questions.has_free_trial.criteria).toEqual({
      true: trial.whenTrue,
      false: trial.whenFalse,
    });
  });

  it("keeps the rubric identity independent of the extraction pipeline", () => {
    const contract = JSON.stringify(rubricContract());
    expect(contract).not.toContain(SNAPSHOT_IMPLEMENTATION_FINGERPRINT);
    expect(contract).not.toContain("@cf/");
    expect(PRICING_PIPELINE_ID).toBe(
      `pricing-snapshot-v4-${SNAPSHOT_IMPLEMENTATION_FINGERPRINT.slice(0, 12)}`,
    );
  });

  it("requires a new fingerprint when the contract changes", async () => {
    expect(await rubricFingerprint()).toBe(PRICING_RUBRIC_FINGERPRINT);
    expect(await rubricFingerprint({ ...rubricContract(), model: "changed" })).not.toBe(
      PRICING_RUBRIC_FINGERPRINT,
    );
  });
});

it("requires a new pipeline id when extraction or validation code changes", () => {
  const hash = createHash("sha256");
  for (const file of [
    "quote-snapshot.ts",
    "capture-state.ts",
    "jev-decisions.ts",
    "scan-workflow.ts",
    "source-cleanup.ts",
  ])
    hash.update(readFileSync(new URL(file, import.meta.url)));
  expect(hash.digest("hex")).toBe(SNAPSHOT_IMPLEMENTATION_FINGERPRINT);
});
