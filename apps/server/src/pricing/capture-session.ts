import puppeteer, { type Browser } from "@cloudflare/puppeteer";

/** What the capture step reads from Browser Run, whichever way the page was captured. */
export type CaptureSnapshot = {
  success: true;
  result: { content?: string; screenshot?: string; markdown?: string; accessibilityTree?: unknown };
  meta: { status?: number; title: string; finalUrl?: string };
};

type Launch = (binding: never) => Promise<Browser>;

const BOT_CHECK_WAIT_MS = 20_000;
// The same test the state script uses: a few words, no amount, and bot-check wording.
const STILL_CHECKING = `(() => {
  const text = ((document.body && document.body.innerText) || '').replace(/\\s+/g, ' ').trim();
  return text.length < 600 && !/[$€£¥]\\s?\\d|\\d\\s?(?:€|USD|EUR)\\b/.test(text) &&
    /verif|checking your browser|just a moment|please wait|security check|captcha|are you (?:a )?human|access denied|ddos|bot protection|one moment/i.test(text + ' ' + document.title);
})()`;

const toRegExp = (pattern: string) => new RegExp(pattern.slice(1, pattern.lastIndexOf("/")));

/**
 * Captures a page the one-shot snapshot cannot: behind a bot check that redirects (which wipes
 * the injected scripts) or under a Content-Security-Policy that blocks them. A session waits
 * for the real page, allows the scripts, then injects them.
 */
export async function captureThroughBotCheck(
  binding: unknown,
  input: {
    url: string;
    headers: Record<string, string>;
    blocked: string[];
    scripts: string[];
    readySelector: string;
  },
  launch: Launch = puppeteer.launch as unknown as Launch,
): Promise<CaptureSnapshot> {
  const browser = await launch(binding as never);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    // Strict Content-Security-Policy pages (github.com) block the injected inline scripts.
    await page.setBypassCSP(true);
    await page.setExtraHTTPHeaders(input.headers);
    const blocked = input.blocked.map(toRegExp);
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (blocked.some((pattern) => pattern.test(request.url()))) void request.abort();
      else void request.continue();
    });
    let status: number | undefined;
    page.on("response", (response) => {
      if (response.request().isNavigationRequest() && response.frame() === page.mainFrame())
        status = response.status();
    });

    // The state-ready marker proves capture completion. Network-idle can time out on pages that poll or stream.
    await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const deadline = Date.now() + BOT_CHECK_WAIT_MS;
    while (Date.now() < deadline) {
      // Evaluating during the redirect throws; that is still the check.
      const checking = await page.evaluate(STILL_CHECKING).catch(() => true);
      if (!checking) break;
      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 5_000 }).catch(() => {});
    }

    for (const content of input.scripts) await page.addScriptTag({ content });
    await page.waitForSelector(input.readySelector, { timeout: 30_000 });
    const [content, screenshot, title, markdown] = await Promise.all([
      page.content(),
      page.screenshot({ fullPage: true, type: "png", encoding: "base64" }) as Promise<string>,
      page.title(),
      page.evaluate("document.body ? document.body.innerText : ''") as Promise<string>,
    ]);
    return {
      success: true,
      result: { content, screenshot, markdown },
      meta: { status, title, finalUrl: page.url() },
    };
  } finally {
    await browser.close();
  }
}
