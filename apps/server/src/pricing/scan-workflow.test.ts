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
  it.each(["", " \n\t "])("rejects unusable blank source text", (markdown) => {
    expect(() =>
      assertUsableCapture({
        httpStatus: 200,
        title: "Pricing",
        html: "<main></main>",
        markdown,
      }),
    ).toThrow("Pricing source is blank");
  });

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

  it("rejects a short page without any amount, such as a bot check", () => {
    expect(() =>
      assertUsableCapture({
        httpStatus: 200,
        title: "autocalls.ai",
        html: "<main>Please wait while your request is being verified...</main>",
        markdown:
          "## state: default\n[Loader] | Please wait while your request is being verified...",
      }),
    ).toThrow("Captured page shows no pricing content");
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

  it("covers CookieScript, as used by n8n, and records the outcome in the archived HTML", () => {
    expect(CONSENT_DISMISS_SCRIPT.indexOf("#cookiescript_reject")).toBeLessThan(
      CONSENT_DISMISS_SCRIPT.indexOf("#cookiescript_accept"),
    );
    expect(CONSENT_DISMISS_SCRIPT).toContain("dataset.pricelogConsent");
  });

  it("is valid JavaScript", () => {
    expect(() => new Function(CONSENT_DISMISS_SCRIPT)).not.toThrow();
  });
});

describe("parseJevAnswers", () => {
  const questions: PersistedQuestion[] = [
    {
      key: "motion",
      type: "choice",
      instructions: "How can a customer buy?",
      criteria: { self_serve: "Buy directly", unknown: "Not established" },
      minimum: null,
      maximum: null,
      position: 0,
    },
    {
      key: "free",
      type: "noul",
      instructions: "Is a free plan stated?",
      criteria: { true: "Stated", false: "Not established" },
      minimum: null,
      maximum: null,
      position: 1,
    },
  ];
  const answers = {
    motion: {
      choice: "self_serve",
      confidence: 0.9,
      probabilities: { self_serve: 0.9, unknown: 0.1 },
    },
    free: { noul: 0.8 },
  };
  it.each([false, true])("maps Choice and Noul from wrapped=%s responses", (wrapped) => {
    const response = wrapped
      ? { state: "Completed", result: { model: "jev-1.13.0", answers } }
      : { answers };
    expect(parseJevAnswers(response, questions)).toEqual([
      { key: "motion", type: "choice", ...answers.motion },
      { key: "free", type: "noul", noul: 0.8 },
    ]);
  });
  it("rejects a missing answer", () => {
    expect(() => parseJevAnswers({ answers: { motion: answers.motion } }, questions)).toThrow(
      "free",
    );
  });
  it("rejects invented and prototype choices", () => {
    for (const choice of ["invented", "toString"])
      expect(() =>
        parseJevAnswers(
          { answers: { ...answers, motion: { ...answers.motion, choice } } },
          questions,
        ),
      ).toThrow("invalid choice");
  });
  it.each([NaN, Infinity, -0.1, 1.1])("rejects invalid Noul probabilities %s", (noul) => {
    expect(() => parseJevAnswers({ answers: { ...answers, free: { noul } } }, questions)).toThrow(
      "invalid noul",
    );
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
