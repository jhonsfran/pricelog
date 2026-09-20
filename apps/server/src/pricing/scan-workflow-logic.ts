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
  const payload = unwrapJevResponse(response);
  if (!payload) {
    throw new Error("Jev returned no answers");
  }
  const answers = payload.answers;
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

function unwrapJevResponse(response: unknown): JevResponse | undefined {
  if (!response || typeof response !== "object") return undefined;
  if ("answers" in response) return response as JevResponse;
  if (!("result" in response)) return undefined;
  const result = response.result;
  if (!result || typeof result !== "object" || !("answers" in result)) return undefined;
  return result as JevResponse;
}

export function jevGatewayOptions() {
  return {
    gateway: {
      id: "default",
      skipCache: true,
      collectLog: true,
    },
  } as const;
}
