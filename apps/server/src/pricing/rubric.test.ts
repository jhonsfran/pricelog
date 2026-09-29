import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import {
  PRICING_CHOICE_CATALOG,
  PRICING_PAGE_SCOPE,
  PRICING_INTELLIGENCE_RUBRIC_ID,
  PRICING_RUBRIC_FINGERPRINT,
} from "@pricelog/db/pricing-intelligence";
import {
  PRICING_PIPELINE_ID,
  SNAPSHOT_IMPLEMENTATION_FINGERPRINT,
} from "@pricelog/db/pricing-snapshot";
import { PRICING_INTELLIGENCE_RUBRIC, rubricFingerprint, rubricContract } from "./rubric";

describe("pricing rubric", () => {
  const rubric = PRICING_INTELLIGENCE_RUBRIC;

  it("asks Jev the product category and the three monetization questions", () => {
    expect(rubric.id).toBe(PRICING_INTELLIGENCE_RUBRIC_ID);
    expect(rubric.version).toBe(13);
    expect(Object.keys(rubric.questions)).toEqual([
      "product_category",
      "limit_behavior",
      "spend_cap",
      "metered_unit",
    ]);
    expect(Object.values(rubric.questions).map((question) => question.type)).toEqual([
      "choice",
      "choice",
      "choice",
      "choice",
    ]);
  });

  it("takes the question text Jev evaluates from the public catalogs", () => {
    const category = PRICING_CHOICE_CATALOG.product_category;
    expect(rubric.questions.product_category.instructions).toBe(
      `${PRICING_PAGE_SCOPE} ${category.question}`,
    );
    expect(rubric.questions.product_category.criteria).toEqual(category.options);
    expect(Object.keys(rubric.questions.limit_behavior.criteria)).toEqual([
      "hard_stop",
      "pay_as_you_go",
      "auto_upgrade",
      "buy_credits",
      "not_stated",
    ]);
    expect(Object.keys(rubric.questions.spend_cap.criteria)).toEqual(["yes", "no", "not_stated"]);
    expect(rubric.questions.metered_unit.instructions).toBe(
      `${PRICING_PAGE_SCOPE} ${PRICING_CHOICE_CATALOG.metered_unit.question}`,
    );
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
    "capture-session.ts",
    "jev-decisions.ts",
    "scan-workflow.ts",
    "source-cleanup.ts",
  ])
    hash.update(readFileSync(new URL(file, import.meta.url)));
  expect(hash.digest("hex")).toBe(SNAPSHOT_IMPLEMENTATION_FINGERPRINT);
});
