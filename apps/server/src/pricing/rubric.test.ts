import { describe, expect, it } from "vitest";
import {
  PRICING_CHOICE_CATALOG,
  PRICING_CHOICE_GROUPS,
  PRICING_SCORE_CATALOG,
  PRICING_SIGNAL_CATALOG,
} from "@my-better-t-app/db/pricing-intelligence";

import { PRICING_INTELLIGENCE_V3 } from "./rubric";

describe("pricing intelligence rubric", () => {
  const questions = Object.entries(PRICING_INTELLIGENCE_V3.questions);

  it("sends score, choice, and noul questions in one question set", () => {
    expect(PRICING_INTELLIGENCE_V3.id).toBe("pricing-intelligence-v3");
    expect(PRICING_INTELLIGENCE_V3.version).toBe(3);
    expect(new Set(questions.map(([, question]) => question.type))).toEqual(
      new Set(["score", "choice", "noul"]),
    );
    expect(questions).toHaveLength(42);
  });

  it("keeps category, AI capability, and market dimensions separate", () => {
    expect(PRICING_INTELLIGENCE_V3.questions.primary_market.type).toBe("choice");
    expect(PRICING_INTELLIGENCE_V3.questions.is_ai_native.type).toBe("noul");
    expect(PRICING_INTELLIGENCE_V3.questions.offers_autonomous_agent.type).toBe("noul");
    expect(PRICING_INTELLIGENCE_V3.questions.market_developer_tools.type).toBe("noul");
  });

  it("asks the commercial questions founders act on", () => {
    expect(PRICING_INTELLIGENCE_V3.questions.value_metric.type).toBe("choice");
    expect(PRICING_INTELLIGENCE_V3.questions.expansion_path.type).toBe("choice");
    expect(PRICING_INTELLIGENCE_V3.questions.price_disclosure.type).toBe("choice");
    expect(PRICING_INTELLIGENCE_V3.questions.value_metric_alignment.type).toBe("score");
    expect(PRICING_INTELLIGENCE_V3.questions.expansion_readiness.type).toBe("score");
  });

  it("measures the AI cost model that generic pricing data misses", () => {
    expect(PRICING_INTELLIGENCE_V3.questions.ai_cost_passthrough.type).toBe("choice");
    expect(PRICING_INTELLIGENCE_V3.questions.has_spend_cap.type).toBe("noul");
    expect(PRICING_INTELLIGENCE_V3.questions.has_usage_visibility.type).toBe("noul");
    expect(PRICING_INTELLIGENCE_V3.questions.credits_expire.type).toBe("noul");
  });

  it("uses unknown choices instead of forcing unsupported classifications", () => {
    const choiceQuestions = questions.filter(([, question]) => question.type === "choice");
    for (const [, question] of choiceQuestions) {
      expect(question.criteria).toHaveProperty("unknown");
    }
  });

  it("has public metadata for every question", () => {
    expect(new Set(Object.keys(PRICING_INTELLIGENCE_V3.questions))).toEqual(
      new Set([
        ...Object.keys(PRICING_SCORE_CATALOG),
        ...Object.keys(PRICING_CHOICE_CATALOG),
        ...Object.keys(PRICING_SIGNAL_CATALOG),
      ]),
    );
  });

  it("derives every prompt from the shared catalog so the published methodology cannot drift", () => {
    for (const [key, entry] of Object.entries(PRICING_SCORE_CATALOG)) {
      const question = PRICING_INTELLIGENCE_V3.questions[key as keyof typeof PRICING_SCORE_CATALOG];
      expect(question.instructions).toBe(entry.question);
      expect(question.criteria).toEqual(entry.criteria);
    }
    for (const [key, entry] of Object.entries(PRICING_CHOICE_CATALOG)) {
      const question =
        PRICING_INTELLIGENCE_V3.questions[key as keyof typeof PRICING_CHOICE_CATALOG];
      expect(question.instructions).toBe(entry.question);
      expect(question.criteria).toEqual(entry.options);
    }
    for (const [key, entry] of Object.entries(PRICING_SIGNAL_CATALOG)) {
      const question =
        PRICING_INTELLIGENCE_V3.questions[key as keyof typeof PRICING_SIGNAL_CATALOG];
      expect(question.instructions).toBe(entry.question);
      expect(question.criteria).toEqual({ true: entry.whenTrue, false: entry.whenFalse });
    }
  });

  it("scores every dimension on the same five-level scale", () => {
    for (const entry of Object.values(PRICING_SCORE_CATALOG)) {
      expect(entry.criteria).toHaveLength(5);
    }
  });

  it("assigns every choice to a known presentation group", () => {
    const groups = new Set(PRICING_CHOICE_GROUPS.map((group) => group.key));
    for (const entry of Object.values(PRICING_CHOICE_CATALOG)) {
      expect(groups.has(entry.group)).toBe(true);
    }
  });

  it("keeps one tag per signal so directory tags stay unambiguous", () => {
    const tags = Object.values(PRICING_SIGNAL_CATALOG).map((signal) => signal.tag);
    expect(new Set(tags).size).toBe(tags.length);
  });
});
