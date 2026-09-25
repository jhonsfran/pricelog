import type { JevAnswer, PersistedQuestion } from "./types";

type JevResponse = {
  answers: Record<
    string,
    {
      type?: "choice" | "noul";
      choice?: string;
      noul?: number;
      confidence?: number;
      probabilities?: Record<string, number>;
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

/**
 * Appended by CONSENT_DISMISS_SCRIPT once it has finished; the capture waits for it. It sits
 * outside <body> so an app re-rendering its root cannot remove it.
 */
export const CAPTURE_READY_SELECTOR = "#pricelog-capture-ready";

/**
 * Runs in the captured page after load. It dismisses known consent managers, preferring
 * rejection, then removes their roots so HTML, Markdown and screenshot agree. Banners owned by
 * the page's own framework are hidden instead: removing a node React still owns crashes the app.
 * It also scrolls once through the page so scroll-triggered reveals and lazy images render in
 * the full-page screenshot. The outcome is written to html[data-pricelog-consent].
 */
export const CONSENT_DISMISS_SCRIPT = String.raw`
(() => {
  const managers = [
    { name: 'cookiebot', roots: ['#CybotCookiebotDialog'],
      reject: ['#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll', '#CybotCookiebotDialogBodyButtonDecline'],
      accept: ['#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', '#CybotCookiebotDialogBodyButtonAccept'] },
    { name: 'onetrust', roots: ['#onetrust-banner-sdk', '.onetrust-pc-dark-filter', '#onetrust-pc-sdk'],
      reject: ['#onetrust-reject-all-handler'], accept: ['#onetrust-accept-btn-handler'] },
    { name: 'usercentrics', roots: ['#usercentrics-root', '#usercentrics-cmp-ui'],
      reject: ['[data-testid="uc-deny-all-button"]'], accept: ['[data-testid="uc-accept-all-button"]'] },
    { name: 'didomi', roots: ['#didomi-host'],
      reject: ['#didomi-notice-disagree-button'], accept: ['#didomi-notice-agree-button'] },
    { name: 'trustarc', roots: ['.truste_overlay', '.truste_box_overlay', '#truste-consent-track'],
      reject: ['.truste-button2', '#truste-consent-required'], accept: ['.truste-button1', '#truste-consent-button'] },
    { name: 'cookiescript', roots: ['#cookiescript_injected_wrapper', '#cookiescript_injected'],
      reject: ['#cookiescript_reject'], accept: ['#cookiescript_accept'] },
    { name: 'cookieyes', roots: ['.cky-consent-container', '.cky-overlay', '.cky-modal'],
      reject: ['.cky-btn-reject'], accept: ['.cky-btn-accept'] },
    { name: 'osano', roots: ['.osano-cm-window'],
      reject: ['.osano-cm-denyAll', '.osano-cm-deny'], accept: ['.osano-cm-accept-all', '.osano-cm-accept'] },
    { name: 'complianz', roots: ['#cmplz-cookiebanner-container', '.cmplz-cookiebanner'],
      reject: ['.cmplz-btn.cmplz-deny'], accept: ['.cmplz-btn.cmplz-accept'] },
    { name: 'iubenda', roots: ['#iubenda-cs-banner'],
      reject: ['.iubenda-cs-reject-btn'], accept: ['.iubenda-cs-accept-btn'] },
    { name: 'hubspot', roots: ['#hs-eu-cookie-confirmation'],
      reject: ['#hs-eu-decline-button'], accept: ['#hs-eu-confirmation-button'] },
    { name: 'termly', roots: ['#termly-code-snippet-support'],
      reject: ['[data-tid="banner-decline"]'], accept: ['[data-tid="banner-accept"]'] },
    { name: 'axeptio', roots: ['#axeptio_overlay'],
      reject: ['#axeptio_btn_dismiss'], accept: ['#axeptio_btn_acceptAll'] },
    { name: 'cookie-notice', roots: ['#cookie-notice'],
      reject: ['#cn-refuse-cookie'], accept: ['#cn-accept-cookie'] },
    { name: 'quantcast', roots: ['.qc-cmp2-container'], reject: [], accept: [] },
    { name: 'sourcepoint', roots: ['[id^="sp_message_container"]'], reject: [], accept: [] }
  ];
  const CONSENT_TEXT = /\bcookies?\b|\bconsent\b|\bgdpr\b|datenschutz/i;
  const REJECT_TEXT = /^(?:reject|decline|deny|refuse)(?: all)?(?: cookies)?$|^(?:only|use) (?:necessary|essential)|^(?:alle )?ablehnen$|^nur (?:notwendige|essenzielle)/i;
  const ACCEPT_TEXT = /^(?:accept|allow|agree)(?: all)?(?: cookies)?$|^(?:alle )?(?:akzeptieren|zulassen)$|^zustimmen$/i;
  const outcome = new Set();
  const handled = new Set();
  let found = false;

  // Consent managers such as Usercentrics render inside open shadow roots.
  const scopes = () => {
    const result = [document];
    const walk = (root) => {
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) { result.push(element.shadowRoot); walk(element.shadowRoot); }
      }
    };
    walk(document);
    return result;
  };
  const queryAll = (selectors, roots) =>
    roots.flatMap((root) => selectors.flatMap((selector) => [...root.querySelectorAll(selector)]));
  const visible = (element) => element instanceof HTMLElement && element.getClientRects().length > 0;
  const clickFirst = (elements) => {
    const target = elements.find(visible);
    if (!target) return false;
    target.click();
    return true;
  };

  const dismissKnown = () => {
    const roots = scopes();
    for (const manager of managers) {
      if (handled.has(manager.name)) continue;
      if (!queryAll(manager.roots, roots).some(visible)) continue;
      found = true;
      if (clickFirst(queryAll(manager.reject, roots))) outcome.add(manager.name + ':rejected');
      else if (clickFirst(queryAll(manager.accept, roots))) outcome.add(manager.name + ':accepted');
      else continue;
      handled.add(manager.name);
    }
  };

  // Fallback for unknown managers: a small fixed or sticky panel about cookies with a button.
  const genericBanners = () =>
    [...document.body.querySelectorAll('*')].filter((element) => {
      if (!visible(element)) return false;
      const position = getComputedStyle(element).position;
      if (position !== 'fixed' && position !== 'sticky') return false;
      const text = element.innerText || '';
      return text.length < 3000 && CONSENT_TEXT.test(text) &&
        !!element.querySelector('button, [role="button"], input[type="button"], input[type="submit"]');
    });
  const buttonText = (element) => (element.innerText || element.value || '').trim().replace(/\s+/g, ' ');

  const hide = (element) => element.style.setProperty('display', 'none', 'important');
  const frameworkOwned = (element) =>
    Object.keys(element).some((key) => key.startsWith('__react') || key.startsWith('__vue') || key === '_vnode');
  const discard = (element) => (frameworkOwned(element) ? hide(element) : element.remove());

  const removeAll = () => {
    const roots = scopes();
    for (const manager of managers) {
      const elements = queryAll(manager.roots, roots);
      if (!elements.length) continue;
      if (elements.some(visible)) { found = true; outcome.add(manager.name + ':removed'); }
      for (const element of elements) discard(element);
    }
    for (const banner of genericBanners()) {
      if (!banner.isConnected) continue;
      found = true;
      const buttons = [...banner.querySelectorAll('button, [role="button"], a, input[type="button"], input[type="submit"]')].filter(visible);
      const reject = buttons.find((button) => REJECT_TEXT.test(buttonText(button)));
      const accept = buttons.find((button) => ACCEPT_TEXT.test(buttonText(button)));
      (reject ?? accept)?.click();
      outcome.add('generic:' + (reject ? 'rejected' : accept ? 'accepted' : 'hidden'));
      // An unknown banner is usually the site's own component, whatever its framework.
      hide(banner);
    }
    if (!found) return;
    for (const element of [document.documentElement, document.body]) {
      element?.style.removeProperty('overflow');
      element?.style.setProperty('overflow', 'auto', 'important');
    }
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  // Reveal libraries throttle scroll handlers, so move half a viewport at a time. At most
  // 24 steps keeps the pass inside the capture wait for any page height. Instant scrolling
  // overrides CSS smooth scrolling, which would otherwise lag far behind each step.
  const scrollTo = (top) => window.scrollTo({ top, left: 0, behavior: 'instant' });
  const revealScrolledContent = async () => {
    await sleep(250);
    const height = document.documentElement.scrollHeight;
    const step = Math.max(window.innerHeight / 2, height / 24);
    for (let y = step; y < height; y += step) {
      scrollTo(y);
      await sleep(120);
    }
    scrollTo(0);
  };

  dismissKnown();
  const polling = setInterval(dismissKnown, 250);
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearInterval(polling);
    try {
      dismissKnown();
      removeAll();
      scrollTo(0);
    } catch (error) {
      outcome.add('error');
    } finally {
      document.documentElement.dataset.pricelogConsent = outcome.size ? [...outcome].join(' ') : 'none';
      const ready = document.createElement('meta');
      ready.id = 'pricelog-capture-ready';
      document.documentElement.appendChild(ready);
    }
  };
  revealScrolledContent().then(() => sleep(600)).then(finish);
  setTimeout(finish, 4000);
})();
`;

export function assertUsableCapture(input: CaptureValidationInput): number {
  if (!input.markdown.trim()) {
    throw new Error("Pricing source is blank");
  }
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

export function extractPageDescription(html: string): string | null {
  const descriptions = new Map<string, string>();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = parseHtmlAttributes(match[0]);
    const key = (attributes.name ?? attributes.property)?.toLowerCase();
    const content = attributes.content;
    if (!key || !content || descriptions.has(key)) continue;
    descriptions.set(key, normalizeMetadataText(content));
  }

  return (
    descriptions.get("description") ||
    descriptions.get("og:description") ||
    descriptions.get("twitter:description") ||
    null
  );
}

function parseHtmlAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s"'=<>`]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of tag.matchAll(pattern)) {
    const name = match[1]?.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4];
    if (name && value !== undefined) attributes[name] = value;
  }
  return attributes;
}

function normalizeMetadataText(value: string): string {
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
  };
  return value.replace(/&(#(?:x[\da-f]+|\d+)|[a-z]+);/gi, (entity, code: string) => {
    const numeric =
      code.startsWith("#x") || code.startsWith("#X")
        ? Number.parseInt(code.slice(2), 16)
        : code.startsWith("#")
          ? Number.parseInt(code.slice(1), 10)
          : null;
    if (
      numeric !== null &&
      Number.isInteger(numeric) &&
      numeric >= 0 &&
      numeric <= 0x10ffff &&
      !(numeric >= 0xd800 && numeric <= 0xdfff)
    ) {
      return String.fromCodePoint(numeric);
    }
    if (numeric !== null) return entity;
    return named[code.toLowerCase()] ?? entity;
  });
}

export function parseJevAnswers(response: unknown, questions: PersistedQuestion[]): JevAnswer[] {
  const payload = unwrapJevResponse(response);
  if (!payload) {
    throw new Error("Jev returned no answers");
  }
  const answers = payload.answers;
  return questions.map((question) => {
    const value = answers[question.key];
    if (!value) throw new Error(`Jev returned an invalid answer for ${question.key}`);
    if (question.type === "choice") {
      if (
        typeof value.choice !== "string" ||
        !Object.hasOwn(question.criteria, value.choice) ||
        !isUnitInterval(value.confidence) ||
        !isProbabilityRecord(value.probabilities)
      ) {
        throw new Error(`Jev returned an invalid choice answer for ${question.key}`);
      }
      return {
        key: question.key,
        type: question.type,
        choice: value.choice,
        confidence: value.confidence!,
        probabilities: value.probabilities!,
      };
    }
    if (!isUnitInterval(value.noul)) {
      throw new Error(`Jev returned an invalid noul answer for ${question.key}`);
    }
    return { key: question.key, type: question.type, noul: value.noul! };
  });
}

function isUnitInterval(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isProbabilityRecord(value: unknown): value is Record<string, number> {
  return (
    !!value &&
    typeof value === "object" &&
    Object.values(value).every((probability) => isUnitInterval(probability))
  );
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
