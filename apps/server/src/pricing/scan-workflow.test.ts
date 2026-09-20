import { describe, expect, it } from "vitest";

import {
  artifactKeys,
  assertUsableCapture,
  CONSENT_DISMISS_SCRIPT,
  isJevProviderCredentialError,
  parseJevAnswers,
  scorePricingHeuristically,
} from "./scan-workflow-logic";

describe("artifactKeys", () => {
  it("uses deterministic private paths", () => {
    expect(artifactKeys("example.com", "run-1")).toEqual({
      htmlKey: "pages/example.com/runs/run-1/page.html",
      screenshotKey: "pages/example.com/runs/run-1/page.png",
      contentKey: "pages/example.com/runs/run-1/page.md",
    });
  });
});

describe("capture validation", () => {
  it("rejects a capture without a target status", () => {
    expect(() =>
      assertUsableCapture({
        httpStatus: undefined,
        title: "Pricing",
        html: "<main>Pricing</main>",
        markdown: "# Pricing",
      }),
    ).toThrow("Target response status is missing");
  });

  it("rejects an origin error before it can be archived", () => {
    expect(() =>
      assertUsableCapture({
        httpStatus: 403,
        title: "Attention Required! | Cloudflare",
        html: "<h1>Sorry, you have been blocked</h1>",
        markdown: "# Sorry, you have been blocked",
      }),
    ).toThrow("Target returned HTTP 403");
  });

  it("rejects a bot challenge that returns HTTP 200", () => {
    expect(() =>
      assertUsableCapture({
        httpStatus: 200,
        title: "Just a moment...",
        html: '<form id="challenge-form"><div class="cf-chl-widget"></div></form>',
        markdown: "Enable JavaScript and cookies to continue",
      }),
    ).toThrow("Target returned a bot challenge");
  });

  it("allows a normal pricing page", () => {
    expect(() =>
      assertUsableCapture({
        httpStatus: 200,
        title: "Pricing",
        html: "<main><h1>Pricing</h1><p>Pro: $20 per month</p></main>",
        markdown: "# Pricing\n\nPro: $20 per month",
      }),
    ).not.toThrow();
  });
});

describe("consent dismissal", () => {
  it("prefers non-essential cookie rejection and covers Cookiebot", () => {
    expect(CONSENT_DISMISS_SCRIPT).toContain(
      "CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll",
    );
    expect(CONSENT_DISMISS_SCRIPT.indexOf("onetrust-reject-all-handler")).toBeLessThan(
      CONSENT_DISMISS_SCRIPT.indexOf("onetrust-accept-btn-handler"),
    );
  });
});

describe("parseJevAnswers", () => {
  const questions = [
    {
      key: "clarity",
      type: "score" as const,
      instructions: "How clear is it?",
      criteria: ["unclear", "clear"],
      minimum: 0,
      maximum: 1,
      position: 0,
    },
  ];

  it("validates and maps score answers", () => {
    expect(
      parseJevAnswers(
        {
          answers: {
            clarity: {
              score: 0.75,
              confidence: 0.9,
              probabilities: { "0": 0.25, "1": 0.75 },
            },
          },
        },
        questions,
      ),
    ).toEqual([
      {
        key: "clarity",
        score: 0.75,
        confidence: 0.9,
        legend: { "0": "unclear", "1": "clear" },
        probabilities: { "0": 0.25, "1": 0.75 },
      },
    ]);
  });

  it("rejects missing answers", () => {
    expect(() => parseJevAnswers({ answers: {} }, questions)).toThrow("clarity");
  });
});

describe("Jev fallback", () => {
  const questions = [
    "pricing_transparency",
    "pricing_clarity",
    "pricing_completeness",
    "plan_comparability",
    "purchase_actionability",
  ].map((key, position) => ({
    key,
    type: "score" as const,
    instructions: key,
    criteria: ["none", "low", "medium", "good", "complete"],
    minimum: 0,
    maximum: 4,
    position,
  }));

  it("recognizes only the Jev provider credential failure", () => {
    expect(
      isJevProviderCredentialError(new Error("AiGatewayError: 2049: Invalid User Credentials")),
    ).toBe(true);
    expect(isJevProviderCredentialError(new Error("Browser Run failed with 500"))).toBe(false);
  });

  it("produces explicit low-confidence scores from pricing content", () => {
    const answers = scorePricingHeuristically(
      `# Pricing\n## Starter — $10 per month\nIncludes 5 users and email support.\n## Pro — $25 per month\nIncludes unlimited projects. Extra users cost $5.\nStart free trial or contact sales. Cancel any time.`,
      questions,
    );

    expect(answers).toHaveLength(5);
    expect(answers.every((answer) => answer.confidence === 0.25)).toBe(true);
    expect(answers.every((answer) => answer.score >= 0 && answer.score <= 4)).toBe(true);
    expect(
      answers.find((answer) => answer.key === "pricing_transparency")?.score,
    ).toBeGreaterThanOrEqual(3);
    expect(answers.find((answer) => answer.key === "purchase_actionability")?.score).toBe(4);
  });
});
