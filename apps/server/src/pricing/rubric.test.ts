import { describe, expect, it } from "vitest";
import {
  PRICING_CHOICE_CATALOG,
  PRICING_SCORE_CATALOG,
  PRICING_SIGNAL_CATALOG,
} from "@my-better-t-app/db/pricing-intelligence";

import { PRICING_INTELLIGENCE_V2 } from "./rubric";

describe("pricing intelligence rubric", () => {
  const questions = Object.entries(PRICING_INTELLIGENCE_V2.questions);

  it("sends score, choice, and noul questions in one question set", () => {
    expect(PRICING_INTELLIGENCE_V2.id).toBe("pricing-intelligence-v2");
    expect(new Set(questions.map(([, question]) => question.type))).toEqual(
      new Set(["score", "choice", "noul"]),
    );
    expect(questions).toHaveLength(28);
  });

  it("keeps category, AI capability, and market dimensions separate", () => {
    expect(PRICING_INTELLIGENCE_V2.questions.primary_market.type).toBe("choice");
    expect(PRICING_INTELLIGENCE_V2.questions.is_ai_native.type).toBe("noul");
    expect(PRICING_INTELLIGENCE_V2.questions.offers_autonomous_agent.type).toBe("noul");
    expect(PRICING_INTELLIGENCE_V2.questions.market_developer_tools.type).toBe("noul");
  });

  it("uses unknown choices instead of forcing unsupported classifications", () => {
    const choiceQuestions = questions.filter(([, question]) => question.type === "choice");
    for (const [, question] of choiceQuestions) {
      expect(question.criteria).toHaveProperty("unknown");
    }
  });

  it("has public metadata for every question", () => {
    expect(new Set(Object.keys(PRICING_INTELLIGENCE_V2.questions))).toEqual(
      new Set([
        ...Object.keys(PRICING_SCORE_CATALOG),
        ...Object.keys(PRICING_CHOICE_CATALOG),
        ...Object.keys(PRICING_SIGNAL_CATALOG),
      ]),
    );
  });
});
