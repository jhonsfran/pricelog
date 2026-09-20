import type { JevAnswer, PersistedQuestion } from "./types";

type JevResponse = {
  answers: Record<
    string,
    {
      score: number;
      confidence: number;
      legend?: Record<string, string>;
      probabilities: Record<string, number>;
    }
  >;
};

type CaptureValidationInput = {
  httpStatus: number | undefined;
  title: string;
  html: string;
  markdown: string;
};

const BOT_CHALLENGE_PATTERNS = [
  /attention required!\s*\|\s*cloudflare/i,
  /sorry, you have been blocked/i,
  /<[^>]+(?:id|class)=["'][^"']*(?:cf-chl|challenge-form)[^"']*["']/i,
  /enable javascript and cookies to continue/i,
];

export const CONSENT_DISMISS_SCRIPT = String.raw`
(() => {
  const rejectSelectors = [
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll',
    '#CybotCookiebotDialogBodyButtonDecline',
    '#onetrust-reject-all-handler',
    '[data-testid="uc-deny-all-button"]',
    '#didomi-notice-disagree-button',
    '.truste-button2'
  ];
  const acceptSelectors = [
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    '#CybotCookiebotDialogBodyButtonAccept',
    '#onetrust-accept-btn-handler',
    '[data-testid="uc-accept-all-button"]',
    '#didomi-notice-agree-button',
    '.truste-button1'
  ];
  const bannerSelectors = [
    '#CybotCookiebotDialog',
    '#onetrust-banner-sdk',
    '#usercentrics-root',
    '#didomi-host',
    '.truste_overlay',
    '.truste_box_overlay'
  ];
  let dismissed = false;

  const clickFirstVisible = (selectors) => {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element instanceof HTMLElement && element.getClientRects().length > 0) {
        element.click();
        return true;
      }
    }
    return false;
  };

  const dismiss = () => {
    if (dismissed) return;
    dismissed = clickFirstVisible(rejectSelectors) || clickFirstVisible(acceptSelectors);
    if (!dismissed) return;
    document.documentElement.style.removeProperty('overflow');
    document.body?.style.removeProperty('overflow');
  };

  dismiss();
  const observer = new MutationObserver(dismiss);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(dismiss, 250);
  setTimeout(dismiss, 750);
  setTimeout(dismiss, 1500);
  setTimeout(() => {
    dismiss();
    observer.disconnect();
    for (const selector of bannerSelectors) {
      const element = document.querySelector(selector);
      if (element instanceof HTMLElement && element.getClientRects().length > 0) {
        element.style.setProperty('display', 'none', 'important');
      }
    }
    document.documentElement.style.setProperty('overflow', 'auto', 'important');
    document.body?.style.setProperty('overflow', 'auto', 'important');
  }, 2500);
})();
`;

export function assertUsableCapture(input: CaptureValidationInput): number {
  if (typeof input.httpStatus !== "number" || !Number.isFinite(input.httpStatus)) {
    throw new Error("Target response status is missing");
  }
  if (input.httpStatus < 200 || input.httpStatus >= 300) {
    throw new Error(`Target returned HTTP ${input.httpStatus}`);
  }

  const documentText = `${input.title}\n${input.html}\n${input.markdown}`;
  if (BOT_CHALLENGE_PATTERNS.some((pattern) => pattern.test(documentText))) {
    throw new Error("Target returned a bot challenge");
  }

  return input.httpStatus;
}

export function artifactKeys(normalizedDomain: string, runId: string) {
  const prefix = `pages/${normalizedDomain}/runs/${runId}`;
  return {
    htmlKey: `${prefix}/page.html`,
    screenshotKey: `${prefix}/page.png`,
    contentKey: `${prefix}/page.md`,
  };
}

export function parseJevAnswers(response: unknown, questions: PersistedQuestion[]): JevAnswer[] {
  if (!response || typeof response !== "object" || !("answers" in response)) {
    throw new Error("Jev returned no answers");
  }
  const answers = (response as JevResponse).answers;
  return questions.map((question) => {
    const value = answers[question.key];
    if (
      !value ||
      !Number.isFinite(value.score) ||
      !Number.isFinite(value.confidence) ||
      !value.probabilities
    ) {
      throw new Error(`Jev returned an invalid answer for ${question.key}`);
    }
    return {
      key: question.key,
      score: value.score,
      confidence: value.confidence,
      legend:
        value.legend ?? Object.fromEntries(question.criteria.map((label, index) => [index, label])),
      probabilities: value.probabilities,
    };
  });
}

export function isJevProviderCredentialError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("2049") && message.includes("Invalid User Credentials");
}

export function scorePricingHeuristically(
  markdown: string,
  questions: PersistedQuestion[],
): JevAnswer[] {
  const content = markdown.toLowerCase();
  const planNames = new Set(
    content.match(/\b(free|starter|basic|pro|professional|business|team|enterprise)\b/g) ?? [],
  );
  const scores: Record<string, number> = {
    pricing_transparency: indicators(content, [
      /(?:[$€£¥]|\b(?:usd|eur|gbp|cad|aud)\b)\s*\d|\d\s*(?:[$€£¥]|\b(?:usd|eur|gbp|cad|aud)\b)/,
      /[$€£¥]|\b(?:usd|eur|gbp|cad|aud)\b/,
      /\b(?:per|\/)(?:\s+)?(?:month|mo|year|yr|user|seat|unit|request)\b|\bmonthly\b|\bannually\b/,
      /\b(?:billed|starting at|from|per user|per seat|usage|unit)\b/,
    ]),
    pricing_clarity: indicators(content, [
      /^#{1,4}\s+/m,
      /\b(?:plan|tier|pricing)\b/,
      /\b(?:monthly|annual|annually|billing|contract)\b/,
      /(?:^|\n)\s*(?:[-*]|\d+\.)\s+/m,
    ]),
    pricing_completeness: indicators(content, [
      /\b(?:include|feature|support)\w*\b/,
      /\b(?:limit|unlimited|users?|seats?|projects?|requests?)\b/,
      /\b(?:monthly|annual|annually|billing)\b/,
      /\b(?:overage|extra|add-on|tax|contract|cancel)\w*\b/,
    ]),
    plan_comparability: Math.min(
      4,
      (planNames.size >= 2 ? 2 : planNames.size) +
        indicators(content, [
          /\b(?:compare|versus|vs\.?|difference)\b/,
          /\b(?:include|feature|limit)\w*\b/,
        ]),
    ),
    purchase_actionability: indicators(content, [
      /\b(?:buy|subscribe|sign up|get started|start now|start free)\b/,
      /\b(?:free trial|try free|trial)\b/,
      /\b(?:contact sales|talk to sales|book a demo)\b/,
      /\b(?:cancel|contract|commitment)\w*\b/,
    ]),
  };

  return questions.map((question) => {
    const score = Math.max(0, Math.min(4, scores[question.key] ?? 0));
    return {
      key: question.key,
      score,
      confidence: 0.25,
      legend: Object.fromEntries(question.criteria.map((label, index) => [index, label])),
      probabilities: Object.fromEntries(
        question.criteria.map((_, index) => [index, index === score ? 1 : 0]),
      ),
    };
  });
}

function indicators(content: string, patterns: RegExp[]): number {
  return patterns.reduce((score, pattern) => score + (pattern.test(content) ? 1 : 0), 0);
}
