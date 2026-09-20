import { describe, expect, it } from "vitest";

import {
  artifactKeys,
  assertUsableCapture,
  CONSENT_DISMISS_SCRIPT,
  extractPageDescription,
  jevGatewayOptions,
  parseJevAnswers,
} from "./scan-workflow-logic";
import type { PersistedQuestion } from "./types";

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

describe("page metadata", () => {
  it("extracts and normalizes a standard description regardless of attribute order", () => {
    expect(
      extractPageDescription(
        '<meta content="  Predict costs &amp; compare plans.  " data-source="site" name="description">',
      ),
    ).toBe("Predict costs & compare plans.");
  });

  it("falls back to Open Graph metadata", () => {
    expect(
      extractPageDescription('<meta content="Pricing for every team" property="og:description">'),
    ).toBe("Pricing for every team");
  });

  it("returns null when description metadata is absent", () => {
    expect(extractPageDescription("<title>Pricing</title>")).toBeNull();
  });

  it("keeps malformed entities without failing the scan", () => {
    expect(extractPageDescription('<meta name="description" content="Plans &#9999999999;">')).toBe(
      "Plans &#9999999999;",
    );
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
        type: "score",
        score: 0.75,
        confidence: 0.9,
        legend: { "0": "unclear", "1": "clear" },
        probabilities: { "0": 0.25, "1": 0.75 },
      },
    ]);
  });

  it("unwraps the completed AI Gateway response", () => {
    expect(
      parseJevAnswers(
        {
          state: "Completed",
          result: {
            model: "jev-1.13.0",
            answers: {
              clarity: {
                type: "score",
                score: 0.6,
                confidence: 0.7,
                probabilities: { "0": 0.4, "1": 0.6 },
              },
            },
          },
          gatewayMetadata: { keySource: "BYOK" },
        },
        questions,
      ),
    ).toEqual([
      {
        key: "clarity",
        type: "score",
        score: 0.6,
        confidence: 0.7,
        legend: { "0": "unclear", "1": "clear" },
        probabilities: { "0": 0.4, "1": 0.6 },
      },
    ]);
  });

  it("rejects missing answers", () => {
    expect(() => parseJevAnswers({ answers: {} }, questions)).toThrow("clarity");
  });

  it("maps score, choice, and noul answers from the same response", () => {
    const typedQuestions: PersistedQuestion[] = [
      questions[0]!,
      {
        key: "motion",
        type: "choice" as const,
        instructions: "How can a customer buy?",
        criteria: { self_serve: "Buy directly", unknown: "Not established" },
        minimum: null,
        maximum: null,
        position: 1,
      },
      {
        key: "has_free_plan",
        type: "noul" as const,
        instructions: "Is there a free plan?",
        criteria: { true: "Free plan", false: "No free plan" },
        minimum: null,
        maximum: null,
        position: 2,
      },
    ];

    expect(
      parseJevAnswers(
        {
          answers: {
            clarity: {
              score: 1,
              confidence: 0.9,
              probabilities: { "0": 0, "1": 1 },
            },
            motion: {
              choice: "self_serve",
              confidence: 0.88,
              probabilities: { self_serve: 0.88, unknown: 0.12 },
            },
            has_free_plan: { noul: 0.93 },
          },
        },
        typedQuestions,
      ),
    ).toEqual([
      {
        key: "clarity",
        type: "score",
        score: 1,
        confidence: 0.9,
        legend: { "0": "unclear", "1": "clear" },
        probabilities: { "0": 0, "1": 1 },
      },
      {
        key: "motion",
        type: "choice",
        choice: "self_serve",
        confidence: 0.88,
        probabilities: { self_serve: 0.88, unknown: 0.12 },
      },
      { key: "has_free_plan", type: "noul", noul: 0.93 },
    ]);
  });
});

describe("Jev gateway", () => {
  it("routes Jev through the configured default gateway without caching", () => {
    expect(jevGatewayOptions()).toEqual({
      gateway: {
        id: "default",
        skipCache: true,
        collectLog: true,
      },
    });
  });
});
