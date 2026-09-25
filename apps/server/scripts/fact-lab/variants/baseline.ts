import { join } from "node:path";
import { collectPricingFacts } from "../../../src/pricing/pricing-facts";
import { REPO_ROOT } from "../lab";
import type { LabFact, Variant } from "../schema";

const PIPELINE = [
  "pricing-facts.ts",
  "fact-role-spec.ts",
  "source-candidates.ts",
  "fact-projection.ts",
  "jev-decisions.ts",
  "source-cleanup.ts",
].map((file) => join(REPO_ROOT, "apps/server/src/pricing", file));

/** The current production collector, unchanged. Its fingerprint tracks the working-tree pipeline. */
export const baseline: Variant = {
  id: "baseline",
  parent: null,
  hypothesis: "Current collectPricingFacts on the archived Markdown, as production runs it.",
  files: [...PIPELINE, import.meta.filename],
  settings: {},
  async extract(capture, decide) {
    try {
      const collected = await collectPricingFacts(capture.markdown, decide);
      const facts: LabFact[] = collected.facts.map((fact) => ({
        plan: fact.offer,
        role: fact.key,
        amount: fact.amount,
        unit: fact.unit,
        currency: fact.currency,
        period: fact.period,
        billing: fact.billing,
        quantity: fact.quantity,
        quantityUnit: fact.quantityUnit,
        evidence: fact.evidence,
        confidence: fact.confidence,
      }));
      return {
        status: "collected",
        facts,
        abstentions: [
          { reason: "uncertain numeric candidates", detail: String(collected.coverage.uncertain) },
          { reason: "ignored numeric candidates", detail: String(collected.coverage.ignored) },
        ],
      };
    } catch (error) {
      return {
        status: "unavailable",
        reason: error instanceof Error ? error.message : String(error),
        facts: [],
        abstentions: [],
      };
    }
  },
};
