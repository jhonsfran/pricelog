export const STATE_READY_SELECTOR = "#pricelog-state-ready";
const STATE_ELEMENT_ID = "pricelog-state";

export type CapturedState = {
  text: string;
  billingView: "monthly" | "annual" | "unknown";
  states: number;
  /** Whether the script switched the page to the configured currency. */
  currencySelection: "selected" | "already" | "none";
};

/**
 * Runs in the captured page after CONSENT_DISMISS_SCRIPT signals it is done. It records only
 * what a visitor can see, then clicks billing toggles, tabs and sliders and records what each
 * one changes. The result is written outside <body> as JSON, followed by the ready marker.
 */
export const CAPTURE_STATE_SCRIPT = String.raw`
(() => {
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'IFRAME', 'CANVAS', 'VIDEO', 'INPUT', 'SELECT', 'TEXTAREA']);
  const CHROME = 'header, nav, footer, [role="navigation"], [role="banner"], [role="contentinfo"], [role="dialog"], [aria-modal="true"]';
  const BILLING = /^(monthly|yearly|annual(ly)?|annual billing|monthly billing|pay (monthly|yearly|annually)|billed (monthly|yearly|annually)|month|year)\b/i;
  const CONSENT = /\bcookies?\b|\bconsent\b|\bgdpr\b/i;
  const MONEY = /[$€£¥]\s?\d|\d\s?(?:€|USD|EUR)\b/;
  const MAX_STATES = 16;
  const MAX_STATE_CHARS = 8000;
  const MAX_TOTAL_CHARS = 40000;
  const deadline = Date.now() + 12000;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const clean = (value) => value.replace(/\s+/g, ' ').trim();

  const visible = (element, style) => {
    if (style.display === 'contents') return true;
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    if (Number(style.opacity) === 0 || element.getAttribute('aria-hidden') === 'true') return false;
    const rect = element.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return false;
    // Digit reels and collapsed panels move content outside a clipping ancestor.
    for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const parentStyle = getComputedStyle(parent);
      const overflow = parentStyle.overflowX + parentStyle.overflowY;
      if (/auto|scroll/.test(overflow)) break;
      if (/hidden|clip/.test(overflow)) {
        const box = parent.getBoundingClientRect();
        if (rect.bottom <= box.top + 1 || rect.top >= box.bottom - 1 || rect.right <= box.left + 1 || rect.left >= box.right - 1) return false;
        break;
      }
    }
    return true;
  };
  const shown = (element) => visible(element, getComputedStyle(element));

  const iconToken = (element) => {
    const label = element.getAttribute('aria-label') || element.getAttribute('alt') || element.getAttribute('title') ||
      (element.querySelector && element.querySelector('title') ? element.querySelector('title').textContent : '');
    if (label && clean(label)) return '[' + clean(label) + ']';
    const hint = ((element.getAttribute('class') || '') + ' ' + (element.getAttribute('data-icon') || '') + ' ' + (element.getAttribute('src') || '')).toLowerCase();
    if (/check|tick|included/.test(hint)) return '[✓]';
    if (/(^|[\s-])(x|cross|close|minus|dash|excluded)([\s-]|$)/.test(hint)) return '[✗]';
    if (element.tagName === 'IMG') return '';
    const match = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?/.exec(getComputedStyle(element).color);
    if (!match) return '[icon]';
    const [r, g, b] = [match[1], match[2], match[3]].map((value) => Number(value) / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min < 0.15 || (match[4] && Number(match[4]) < 0.5)) return '[icon:gray]';
    const hue = max === r ? (60 * ((g - b) / (max - min)) + 360) % 360
      : max === g ? 60 * ((b - r) / (max - min)) + 120 : 60 * ((r - g) / (max - min)) + 240;
    return hue < 25 || hue > 335 ? '[icon:red]' : hue > 75 && hue < 170 ? '[icon:green]' : '[icon]';
  };

  const flat = (nodes) => nodes.flatMap((node) => (typeof node === 'string' ? [node] : flat(node)));
  // Prices split across elements ("$" "160" "/mo", "$8" ".33") read as one amount.
  const mergeMoney = (nodes) => {
    const out = [];
    for (const node of nodes) {
      const previous = out[out.length - 1];
      if (typeof node === 'string' && typeof previous === 'string' &&
          (/^(?:[A-Z]{0,2}[$€£¥]|USD|EUR)$/.test(previous) && /^\d/.test(node) ||
           /[$€£¥]\s?\d[\d,]*$/.test(previous) && /^[.,]\d+/.test(node))) {
        out[out.length - 1] = previous + node;
      } else out.push(node);
    }
    return out;
  };

  function build(element) {
    const out = [];
    let line = '';
    const flush = () => {
      const text = clean(line).replace(/([$€£¥]\s?\d[\d,]*)\s+([.,]\d{2}\b)/g, '$1$2');
      if (text) out.push(text);
      line = '';
    };
    const children = element.shadowRoot ? [...element.shadowRoot.childNodes, ...element.childNodes] : [...element.childNodes];
    for (const node of children) {
      if (node.nodeType === 3) { line += node.textContent; continue; }
      if (node.nodeType !== 1 || SKIP_TAGS.has(node.tagName) || node.matches(CHROME)) continue;
      const style = getComputedStyle(node);
      if (!visible(node, style)) continue;
      if (node.tagName === 'BR') { flush(); continue; }
      if (node.tagName === 'svg' || node.tagName === 'IMG' || (node.getAttribute('role') === 'img' && node.getAttribute('aria-label'))) {
        const token = iconToken(node);
        if (token) line += ' ' + token + ' ';
        continue;
      }
      const struck = style.textDecorationLine.includes('line-through') || ['S', 'DEL', 'STRIKE'].includes(node.tagName);
      const inline = style.display === 'contents' ||
        (style.display.startsWith('inline') && !/flex|grid|block/.test(style.display));
      if (inline) {
        const sub = build(node);
        if (sub.length <= 1 && sub.every((item) => typeof item === 'string')) {
          const text = sub.join(' ');
          if (text) line += struck ? ' ~~' + text + '~~ ' : ' ' + text + ' ';
          continue;
        }
        flush();
        out.push(...sub);
        continue;
      }
      flush();
      const level = /^H[1-6]$/.test(node.tagName) ? Number(node.tagName[1])
        : node.getAttribute('role') === 'heading' ? Number(node.getAttribute('aria-level') || 2) : 0;
      if (level) {
        const text = clean(flat(build(node)).join(' '));
        if (text) out.push('#'.repeat(level) + ' ' + text);
        continue;
      }
      const row = asRow(node);
      if (row) { out.push(struck ? '~~' + row + '~~' : row); continue; }
      const sub = build(node);
      if (sub.length === 1) out.push(struck && typeof sub[0] === 'string' ? '~~' + sub[0] + '~~' : sub[0]);
      else if (sub.length > 1) out.push(sub);
    }
    flush();
    return mergeMoney(out);
  }

  // Side-by-side leaf children (table rows, div grids) become one "a | b | c" line.
  function asRow(element) {
    const cells = [...element.children].filter((child) => !SKIP_TAGS.has(child.tagName) && shown(child));
    if (cells.length < 2 || cells.length > 12) return null;
    const rects = cells.map((cell) => cell.getBoundingClientRect());
    const sameRow = rects.every((rect, index) => index === 0 ||
      (rect.left >= rects[index - 1].right - 2 && rect.top < rects[index - 1].bottom && rect.bottom > rects[index - 1].top));
    if (!sameRow) return null;
    const texts = [];
    for (const cell of cells) {
      const inner = build(cell);
      if (inner.some((item) => typeof item !== 'string') || inner.length > 2 || inner.join(' ').length > 120) return null;
      const text = clean(inner.join(' '));
      if (text) { texts.push(text); continue; }
      const icons = [cell, ...cell.querySelectorAll('svg,img,[role=img]')].filter((node) => node.matches('svg,img,[role=img]'));
      const token = icons.map(iconToken).find(Boolean);
      if (token) { texts.push(token); continue; }
      const drawn = [cell, ...cell.querySelectorAll('*')].some((node) => ['::before', '::after'].some((pseudo) => {
        const style = getComputedStyle(node, pseudo);
        return (style.content && style.content !== 'none' && style.content !== 'normal') || style.backgroundImage !== 'none';
      }));
      texts.push(drawn ? '[icon]' : '·');
    }
    const joined = texts.join('');
    if (texts.every((text) => text.length <= 12) && MONEY.test(joined) && texts.join(' ').length <= 40) return joined;
    const line = texts.join(' | ');
    return line.length > 400 ? null : line;
  }

  const snapshot = () => build(document.body);
  const key = (node) => JSON.stringify(node);
  // The smallest subtree that holds every change, with the nearest headings as context.
  function diff(before, after, crumbs) {
    if (key(before) === key(after)) return null;
    if (typeof before === 'string' || typeof after === 'string' || before.length !== after.length) return { node: after, crumbs };
    const changed = after.map((child, index) => (key(child) === key(before[index]) ? -1 : index)).filter((index) => index >= 0);
    if (changed.length !== 1) return { node: after, crumbs };
    const preceding = flat(after.slice(0, changed[0]));
    const heading = [...preceding].reverse().find((text) => text.startsWith('#')) || (changed[0] > 0 ? preceding[0] : undefined);
    return diff(before[changed[0]], after[changed[0]], heading ? [...crumbs, heading] : crumbs);
  }
  const print = (node, depth) => typeof node === 'string'
    ? '  '.repeat(depth) + node
    : node.map((child) => print(child, typeof child === 'string' ? depth : depth + 1)).join('\n');

  const controlText = (element) => clean(element.innerText || element.getAttribute('aria-label') ||
    (element.labels && element.labels[0] ? element.labels[0].innerText : '') || '');
  const isSelected = (element) => element.getAttribute('aria-pressed') === 'true' || element.getAttribute('aria-selected') === 'true' ||
    element.getAttribute('aria-checked') === 'true' || element.getAttribute('data-state') === 'active' ||
    element.getAttribute('data-state') === 'on' || element.checked === true;
  const inConsent = (element) => {
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      const position = getComputedStyle(node).position;
      if ((position === 'fixed' || position === 'sticky') && CONSENT.test(node.innerText || '')) return true;
    }
    return false;
  };
  const groups = new Map();
  for (const element of document.querySelectorAll('[role="tab"], [role="radio"], [role="switch"], input[type="radio"], button[aria-pressed], [aria-checked], input[type="range"], [role="slider"], button, label, [role="button"]')) {
    if (element.closest(CHROME) || inConsent(element)) continue;
    const label = element.type === 'radio' && element.labels ? element.labels[0] : null;
    if (!shown(element) && !(label && shown(label))) continue;
    const text = controlText(element);
    const role = element.getAttribute('role');
    const stateful = ['tab', 'radio', 'switch', 'slider'].includes(role) || element.type === 'radio' || element.type === 'range' ||
      element.hasAttribute('aria-pressed') || element.hasAttribute('aria-checked');
    if (!stateful && !BILLING.test(text)) continue;
    if (text.length > 40 && element.type !== 'range') continue;
    const container = element.closest('[role="tablist"], [role="radiogroup"]') ||
      (element.type === 'radio' ? element.form || element.parentElement.parentElement : element.parentElement);
    if (!groups.has(container)) groups.set(container, []);
    groups.get(container).push({ element, text });
  }
  const controlGroups = [...groups.values()];
  const billingGroups = controlGroups.filter((group) => group.some(({ text }) => BILLING.test(text)));
  const otherGroups = controlGroups.filter((group) => !billingGroups.includes(group)).slice(0, 4);
  const selectedLabel = () => controlGroups
    .map((group) => group.find(({ element }) => element.type === 'range' ? false : isSelected(element)))
    .filter(Boolean).map(({ text }) => text).join('; ');

  const activate = (element) => {
    if (element.type === 'radio') (element.labels && element.labels[0] ? element.labels[0] : element).click();
    else element.click();
  };
  const setRange = (element, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, String(value));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const rangeSteps = (element) => {
    const min = Number(element.min || 0);
    const max = Number(element.max || 100);
    const step = Number(element.step || 1);
    const count = Math.min(12, Math.floor((max - min) / step) + 1);
    return Array.from({ length: count }, (_, index) =>
      min + Math.round((index * (max - min)) / Math.max(1, count - 1) / step) * step);
  };

  // Pages with a currency switcher show the configured currency, whatever the browser's location.
  const SYMBOLS = { EUR: '€', USD: '$', GBP: '£', JPY: '¥', CHF: 'CHF', CAD: 'C$', AUD: 'A$' };
  const NAMES = { EUR: 'euros?', USD: 'dollars?|us dollars?', GBP: 'pounds?|sterling' };
  const escape = (value) => value.replace(/[.*+?^()|[\]\\$]/g, '\\$&');
  const currencyPattern = (code) => new RegExp('^(?:' + [code, escape(SYMBOLS[code] || code), NAMES[code]].filter(Boolean)
    .map((token) => '(?:' + token + ')').join('|') + ')(?:\\s*[(/-]?\\s*(?:' + escape(SYMBOLS[code] || code) + '|' + code + ')\\)?)?$', 'i');
  const anyCurrency = new RegExp('^(?:' + Object.keys(SYMBOLS).map((code) => code + '|' + escape(SYMBOLS[code])).join('|') + ')(?![a-z])', 'i');
  const navigates = (element) => element.tagName === 'A' && element.getAttribute('href') && !/^(#|javascript:)/.test(element.getAttribute('href'));
  async function selectCurrency(code) {
    if (!code) return 'none';
    const target = currencyPattern(code);
    for (const select of document.querySelectorAll('select')) {
      if (!shown(select) || inConsent(select)) continue;
      const options = [...select.options];
      const match = options.find((option) => target.test(clean(option.text)) || target.test(option.value));
      if (!match || options.filter((option) => anyCurrency.test(clean(option.text))).length < 2) continue;
      if (select.value === match.value) return 'already';
      select.value = match.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return 'selected';
    }
    const clickable = () => [...document.querySelectorAll('[role="option"], [role="menuitem"], [role="menuitemradio"], [role="radio"], [role="tab"], button, a, li, label')]
      .filter((element) => shown(element) && !inConsent(element) && !navigates(element) && !element.closest(CHROME));
    const findTarget = () => clickable().filter((element) => {
      const text = clean(element.innerText || element.getAttribute('aria-label') || '');
      if (text.length > 24 || !target.test(text)) return false;
      const group = element.parentElement ? element.parentElement.parentElement || element.parentElement : null;
      return !!group && [...group.querySelectorAll('*')].some((other) => other !== element && anyCurrency.test(clean(other.innerText || '')) && !target.test(clean(other.innerText || '')));
    }).find((element, _, matches) => !matches.some((other) => other !== element && element.contains(other)));
    let option = findTarget();
    if (!option) {
      const trigger = clickable().find((element) => {
        const text = clean(element.innerText || '');
        return text.length <= 12 && anyCurrency.test(text) && !target.test(text) &&
          (element.getAttribute('aria-haspopup') || element.getAttribute('aria-expanded') !== null || element.tagName === 'BUTTON');
      });
      if (!trigger) return 'none';
      trigger.click();
      await sleep(400);
      option = findTarget();
      if (!option) { trigger.click(); return 'none'; }
    }
    if (isSelected(option)) return 'already';
    option.click();
    await sleep(700);
    return 'selected';
  }

  async function capture() {
    const currency = await selectCurrency(document.documentElement.dataset.pricelogCurrency);
    const base = snapshot();
    const billingView = /year|annual/i.test(selectedLabel()) ? 'annual' : /month/i.test(selectedLabel()) ? 'monthly' : 'unknown';
    const blocks = [{ label: 'default' + (selectedLabel() ? ' (selected: ' + selectedLabel() + ')' : ''), text: print(base, 0) }];
    const seen = new Set([key(base)]);
    let total = blocks[0].text.length;
    let skipped = 0;
    const record = async (label) => {
      await sleep(400);
      const now = snapshot();
      const nowKey = key(now);
      if (seen.has(nowKey)) return;
      seen.add(nowKey);
      const change = diff(base, now, []);
      if (!change) return;
      const context = change.crumbs.slice(-2).map((crumb) => '(within: ' + crumb + ')');
      const text = [...context, print(Array.isArray(change.node) ? change.node : [change.node], 0)].join('\n');
      // Calculator steps and reflows that change no price are not worth the budget.
      if (!MONEY.test(text) || text.length > MAX_STATE_CHARS || total + text.length > MAX_TOTAL_CHARS || blocks.length > MAX_STATES) {
        skipped++;
        return;
      }
      total += text.length;
      blocks.push({ label, text });
    };
    const walk = async (group, prefix) => {
      const initial = group.find(({ element }) => element.type !== 'range' && isSelected(element));
      for (const { element, text } of group) {
        if (Date.now() > deadline) return;
        if (element.type === 'range') {
          const start = element.value;
          for (const value of rangeSteps(element)) {
            if (Date.now() > deadline) break;
            setRange(element, value);
            await record(prefix + (text || element.id || 'range') + '=' + value);
          }
          setRange(element, start);
        } else {
          activate(element);
          await record(prefix + text);
        }
      }
      if (initial) { activate(initial.element); await sleep(250); }
    };
    for (const billing of billingGroups.length ? billingGroups : [null]) {
      for (const option of billing || [{ element: null, text: '' }]) {
        if (Date.now() > deadline) break;
        let prefix = '';
        if (option.element) {
          activate(option.element);
          await record('billing=' + option.text);
          prefix = 'billing=' + option.text + '; ';
        }
        for (const group of otherGroups) {
          // The currency is fixed by the configured region, not explored like a tab.
          if (group.filter(({ text }) => anyCurrency.test(text)).length >= 2) continue;
          await walk(group, prefix);
        }
      }
      if (billing) {
        const initial = billing.find(({ element }) => isSelected(element));
        if (initial) { activate(initial.element); await sleep(250); }
      }
    }
    return { version: 1, billingView, currency, blocks, skipped };
  }

  const publish = (value) => {
    const data = document.createElement('script');
    data.type = 'application/json';
    data.id = '${STATE_ELEMENT_ID}';
    data.textContent = JSON.stringify(value).replace(/</g, '\\u003c');
    document.documentElement.appendChild(data);
    const ready = document.createElement('meta');
    ready.id = '${STATE_READY_SELECTOR.slice(1)}';
    document.documentElement.appendChild(ready);
  };
  const start = async () => {
    for (let waited = 0; !document.getElementById('pricelog-capture-ready') && waited < 6000; waited += 100) await sleep(100);
    try {
      publish(await capture());
    } catch (error) {
      publish({ version: 1, error: String(error).slice(0, 200) });
    }
  };
  start();
})();
`;

export type CaptureRegion = { currency: string; language: string };

/** Known client-side geo-IP lookups. Blocking them keeps the currency the page serves by default. */
const GEO_LOOKUPS = [
  String.raw`/\/api\/geo/`,
  String.raw`/\/geo(ip|location)/`,
  String.raw`/ipapi\.co|ipinfo\.io|ip-api\.com|api\.country\.is|geolocation-db\.com|ipgeolocation\.io|ipregistry\.co|geojs\.io|freeipapi\.com|geoip-js\.com|ipdata\.co|ipwho\.is|\/cdn-cgi\/trace/`,
];

export function captureRegion(env: {
  PRICING_CAPTURE_CURRENCY?: string;
  PRICING_CAPTURE_LANGUAGE?: string;
}): CaptureRegion {
  return {
    currency: (env.PRICING_CAPTURE_CURRENCY || "EUR").toUpperCase(),
    language: env.PRICING_CAPTURE_LANGUAGE || "en-IE,en;q=0.9",
  };
}

/** Browser Run options that make a capture look like a visitor from the configured region. */
export function regionSnapshotOptions(region: CaptureRegion) {
  return {
    setExtraHTTPHeaders: { "Accept-Language": region.language },
    rejectRequestPattern: GEO_LOOKUPS,
    regionScript: {
      content: `document.documentElement.dataset.pricelogCurrency = ${JSON.stringify(region.currency)};`,
    },
  };
}

type StateBlock = { label: string; text: string };
type StatePayload = {
  version: 1;
  billingView?: string;
  currency?: string;
  blocks?: StateBlock[];
  error?: string;
};

/** The captured state as the outline that extraction and Jev read. Null when the script did not finish. */
export function readCapturedState(html: string): CapturedState | null {
  const match = new RegExp(`<script[^>]*id="${STATE_ELEMENT_ID}"[^>]*>([\\s\\S]*?)</script>`).exec(
    html,
  );
  if (!match) return null;
  let payload: StatePayload;
  try {
    payload = JSON.parse(match[1]!) as StatePayload;
  } catch {
    return null;
  }
  if (!payload.blocks?.length) return null;
  return {
    text: payload.blocks.map((block) => `## state: ${block.label}\n${block.text}`).join("\n\n"),
    billingView:
      payload.billingView === "monthly" || payload.billingView === "annual"
        ? payload.billingView
        : "unknown",
    states: payload.blocks.length,
    currencySelection:
      payload.currency === "selected" || payload.currency === "already" ? payload.currency : "none",
  };
}
