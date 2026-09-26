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
  PROFILE_CHOICE_KEYS,
  PROFILE_FLAG_KEYS,
  SNAPSHOT_IMPLEMENTATION_FINGERPRINT,
} from "@my-better-t-app/db/pricing-snapshot";
import { PRICING_INTELLIGENCE_RUBRIC, rubricFingerprint, rubricContract } from "./rubric";

describe("pricing rubric", () => {
  const rubric = PRICING_INTELLIGENCE_RUBRIC;

  it("uses the new immutable version and only v1 profile questions", () => {
    expect(rubric.id).toBe(PRICING_INTELLIGENCE_RUBRIC_ID);
    expect(rubric.version).toBe(11);
    expect(Object.keys(rubric.questions).sort()).toEqual(
      [...PROFILE_CHOICE_KEYS, ...PROFILE_FLAG_KEYS].sort(),
    );
    expect(rubric.questions).not.toHaveProperty("credit_conversion");
    expect(rubric.questions).not.toHaveProperty("charges_fixed_subscription");
  });

  it("derives every profile question from the public catalogs", () => {
    for (const key of PROFILE_CHOICE_KEYS) {
      const question = rubric.questions[key];
      const entry = PRICING_CHOICE_CATALOG[key];
      expect(question.instructions).toBe(`${PRICING_PAGE_SCOPE} ${entry.question}`);
      expect(question.criteria).toEqual(entry.options);
    }
    for (const key of PROFILE_FLAG_KEYS) {
      const question = rubric.questions[key];
      const entry = PRICING_SIGNAL_CATALOG[key];
      expect(question.instructions).toBe(`${PRICING_PAGE_SCOPE} ${entry.question}`);
      expect(question.criteria).toEqual({ true: entry.whenTrue, false: entry.whenFalse });
    }
  });

  it("keeps the rubric identity independent of the extraction pipeline", () => {
    const contract = JSON.stringify(rubricContract());
    expect(contract).not.toContain(SNAPSHOT_IMPLEMENTATION_FINGERPRINT);
    expect(contract).not.toContain("@cf/");
    expect(PRICING_PIPELINE_ID).toBe(
      `pricing-snapshot-v3-${SNAPSHOT_IMPLEMENTATION_FINGERPRINT.slice(0, 12)}`,
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
