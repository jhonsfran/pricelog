import type { StructuredOffer } from "./page-context";
import type { LocatedControl, Section } from "./cards";

/**
 * Price windows v5 (engine v16): terms propagate backwards through chains of adjacent
 * prices ("$19 $15 $19 /month / per user"), not only between neighbours.
 *
 * Price windows v4 (engine v14): glued words in terms are split ("memberbilled" becomes
 * "member billed"), usage units use the head noun ("1000 message credits" is credits), and
 * mixed-case badges glued to names are removed ("TeamsPopular" becomes "Teams").
 *
 * Price windows v3 (engine v13): same-line terms without words (such as an escaped
 * asterisk) do not stop the reader from taking unit and period lines that follow.
 *
 * Price windows v2 (engine v9): consecutive prices form a pair that shares the terms after
 * the last one; ranges such as "$0.0095 - $0.0099/min" are flagged; per-user wording also
 * matches "user/month".
 *
 * Price windows (engine v4): each price literal gets the lines around it, its terms read
 * by code, and a bounded list of plan-name options. Works without Markdown headings.
 */
export type Line = { index: number; start: number; end: number; text: string };
export type PriceWindow = {
  id: string;
  kind: "money" | "state";
  text: string;
  start: number;
  end: number;
  amount: string | null;
  currencyMark: string | null;
  /** Unit and period words after the literal, from its line or the next short lines. */
  terms: string;
  from: boolean;
  /** Another price literal sits directly before or after this one with no words between. */
  pairedWith: "previous" | "next" | null;
  /** Part of a range such as "$8 - $45". */
  range: boolean;
  before: string[];
  after: string[];
  section: Section | null;
  planOptions: { key: string; name: string; source: string }[];
};

const SPACE = "[ \\t\\u00a0\\u200a\\u202f]";
const CURRENCY = "(?:US\\$|USD|EUR|GBP|[$€£])";
const NUMBER = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?";
const MONEY = new RegExp(
  `(${CURRENCY})${SPACE}?(${NUMBER})(?![\\d%]|${SPACE}?[KkMmBb]\\b)|(${NUMBER})${SPACE}?(€|EUR|USD|GBP)(?![A-Za-z])`,
  "g",
);
const HAS_MONEY = new RegExp(MONEY.source);
const TERMS_LINE =
  /^(?:\\?\/|per\b|each\b|a (?:month|year)\b|an? (?:user|seat|member)\b|billed\b|monthly\b|annually\b|yearly\b|user\b|seat\b|month\b|mo\b|outcome\b|minute\b)/i;
const STATE =
  /^(free|custom|custom pricing|contact sales|contact us|let's talk|lets talk|talk to sales|get a quote)$/i;
const BADGE = /([a-z0-9+)])([A-Z]{2,}(?: [A-Z]{2,})*)$/;
const WORD_BADGE = /([a-z0-9+)])(Popular|Most Popular|Best Value|Recommended|New|Best Deal)$/;

/** Split words that rendering glued together, e.g. "memberbilled" or "monthbilled". */
export function unglue(text: string): string {
  return text.replace(/([a-z])(billed|per|plus|for)\b/g, "$1 $2").replace(/([a-z])(\/)/g, "$1 $2");
}

export function lines(markdown: string): Line[] {
  const result: Line[] = [];
  let start = 0;
  markdown.split("\n").forEach((text, index) => {
    result.push({ index, start, end: start + text.length, text });
    start += text.length + 1;
  });
  return result;
}

/** Strip Markdown and HTML decoration from a candidate name, and split glued badges. */
export function cleanName(raw: string): string {
  const text = raw
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#]+/g, "")
    .replace(/[↓↑→]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const badge = BADGE.exec(text) ?? WORD_BADGE.exec(text);
  return badge ? text.slice(0, badge.index + 1).trim() : text;
}

const FILLER =
  /^(?:from|per|plus|or|and|each|only|starting at|up to|\\?\+|billed .*|monthly|yearly|annually|save .*|popular|new|most popular|best value|recommended)$/i;

function isNameLike(text: string): boolean {
  const name = cleanName(text);
  if (!name || name.length > 48 || /[.!?:]$/.test(name) || FILLER.test(name)) return false;
  if (!/[A-Za-z]{2,}/.test(name)) return false;
  if (/^[-*+•✓✔]|\d[\d,.]*\s*(?:%|x\b)|[$€£]\s?\d/.test(text.trim())) return false;
  if (/^\[.*\]\(.*\)$/.test(text.trim())) return false;
  return name.split(/\s+/).length <= 6;
}

const PER_USER =
  /\b(?:per|\/)\s*(?:[a-z-]+\s+){0,3}(?:user|users|seat|seats|member|members|editor|editors|teammate|teammates|developer|developers|dev|devs|agent seat)\b|\/\s*(?:user|seat|member)\b|^\s*(?:user|seat|member)s?\s*\/|\ba (?:user|seat|member)\b/i;

export function perUser(terms: string): boolean {
  return PER_USER.test(terms);
}

export function periodFromTerms(terms: string): "month" | "year" | "unknown" {
  const head = terms.split(/[+;]|\bfor\b/)[0] ?? terms;
  if (/\b(?:mo|mos|month|months|monthly)\b/i.test(head)) return "month";
  if (/\b(?:yr|yrs|year|years|yearly|annually|annual)\b/i.test(head)) return "year";
  return "unknown";
}

const UNIT_WORDS: [RegExp, string][] = [
  [/^(?:minutes?|mins?)$/i, "minute"],
  [/^(?:seconds?|secs?)$/i, "second"],
  [/^(?:requests?|calls?|api calls?)$/i, "request"],
  [/^(?:tokens?)$/i, "token"],
  [/^(?:messages?)$/i, "message"],
  [/^(?:credits?)$/i, "credit"],
  [/^(?:resolutions?)$/i, "resolution"],
  [/^(?:conversations?|chats?)$/i, "conversation"],
  [/^(?:actions?|tasks?)$/i, "action"],
  [/^(?:images?)$/i, "image"],
  [/^(?:videos?)$/i, "video"],
  [/^(?:pages?)$/i, "page"],
  [/^(?:contacts?)$/i, "contact"],
  [/^(?:emails?)$/i, "email"],
  [/^(?:records?|rows?)$/i, "record"],
  [/^(?:executions?|runs?)$/i, "execution"],
  [/^(?:workflows?)$/i, "workflow"],
  [/^(?:gb|gigabytes?)$/i, "gb"],
];

/** A usage denominator read from terms: quantity and unit word, e.g. "per 1,000 requests". */
export function denominator(
  terms: string,
): { quantity: string; word: string; unit: string | null } | null {
  const head = terms.split(/[+;]/)[0] ?? terms;
  const match =
    /(?:\bper\b|\/)\s*(?:(\d[\d,]*(?:\.\d+)?)\s*([KkMm])?\s+)?((?:[A-Za-z][A-Za-z-]*)(?:\s+[A-Za-z][A-Za-z-]*){0,2})/.exec(
      head,
    ) ?? (/\beach\b/i.test(head) ? ["each", undefined, undefined, "each"] : null);
  if (!match) return null;
  const words = match[3]!.split(/\s+/);
  // "per Fin outcome" names the unit last; "per minute of audio" names it first.
  const word =
    [...words].reverse().find((item) => UNIT_WORDS.some(([pattern]) => pattern.test(item))) ??
    words.find((item) => /^(?:outcome|outcomes|each)$/i.test(item)) ??
    words[0]!;
  if (/^(?:month|mo|year|yr|annum|user|seat|member)s?$/i.test(word)) return null;
  const scale = match[2] ? { k: 1000, m: 1_000_000 }[match[2].toLowerCase() as "k" | "m"] : 1;
  const base = match[1] ? Number(match[1].replaceAll(",", "")) : 1;
  const unit = UNIT_WORDS.find(([pattern]) => pattern.test(word))?.[1] ?? null;
  return { quantity: String(base * scale), word, unit };
}

export type WindowOptions = {
  before: number;
  after: number;
  offers: StructuredOffer[];
  controls: LocatedControl[];
  sectionOf: (offset: number) => Section | null;
};

export function priceWindows(markdown: string, options: WindowOptions): PriceWindow[] {
  const all = lines(markdown);
  const bodyStart = markdown.startsWith("---") ? markdown.indexOf("\n---", 3) + 4 : 0;
  const found: Omit<
    PriceWindow,
    "id" | "before" | "after" | "planOptions" | "terms" | "from" | "pairedWith" | "range"
  >[] = [];
  for (const match of markdown.matchAll(MONEY)) {
    if (match.index < bodyStart) continue;
    const prefix = match[1] !== undefined;
    found.push({
      kind: "money",
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
      amount: (prefix ? match[2] : match[3])!.replaceAll(",", ""),
      currencyMark: (prefix ? match[1] : match[4])!,
      section: options.sectionOf(match.index),
    });
  }
  for (const line of all) {
    if (line.start < bodyStart) continue;
    const text = line.text.trim();
    const stripped = text.replace(/^\*\*|\*\*$/g, "");
    if (STATE.test(stripped)) {
      const start = line.start + line.text.indexOf(stripped);
      found.push({
        kind: "state",
        text: stripped,
        start,
        end: start + stripped.length,
        amount: null,
        currencyMark: null,
        section: options.sectionOf(start),
      });
    }
  }
  found.sort((a, b) => a.start - b.start);
  const lineAt = (offset: number) =>
    all.findIndex((line) => line.start <= offset && offset <= line.end);
  const names = new Set(options.offers.map((offer) => offer.name.toLowerCase()));

  const windows: PriceWindow[] = found.map((candidate, index) => {
    const at = lineAt(candidate.start);
    const line = all[at]!;
    const next = found[index + 1];
    const sameLineEnd = next && next.start <= line.end ? next.start : line.end;
    let terms = markdown.slice(candidate.end, sameLineEnd).trim();
    const from =
      /\bfrom\s*$/i.test(markdown.slice(line.start, candidate.start)) ||
      /^from$/i.test(
        all
          .slice(Math.max(0, at - 3), at)
          .map((item) => item.text.trim())
          .filter(Boolean)
          .at(-1) ?? "",
      );
    if (!/[A-Za-z]/.test(terms) && candidate.kind === "money") {
      const marker = terms;
      const following: string[] = [];
      for (const item of all.slice(at + 1, at + 6)) {
        const text = item.text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim();
        if (!text) continue;
        if (text.length > 60 || HAS_MONEY.test(text) || text.startsWith("#")) break;
        // Only unit and period phrases continue a price, never limits or links on the next line.
        if (!TERMS_LINE.test(text)) break;
        following.push(text);
        if (following.length >= 2) break;
      }
      terms = [marker, ...following].filter(Boolean).join(" ");
    }
    const before = all
      .slice(Math.max(0, at - options.before), at)
      .map((item) => item.text.trim())
      .filter(Boolean);
    const after = all
      .slice(at + 1, at + 1 + options.after)
      .map((item) => item.text.trim())
      .filter(Boolean);
    const prefixText = markdown.slice(line.start, candidate.start).trim();

    const planOptions: PriceWindow["planOptions"] = [];
    const add = (name: string, source: string) => {
      const clean = cleanName(name);
      if (!clean || planOptions.some((option) => option.name.toLowerCase() === clean.toLowerCase()))
        return;
      planOptions.push({ key: `o${planOptions.length}`, name: clean, source });
    };
    for (const control of options.controls)
      if (control.section && candidate.section && control.section.id === candidate.section.id)
        for (const option of control.options)
          if (option.selected) add(option.label, "selected tier option");
    if (prefixText && isNameLike(prefixText))
      add(prefixText, "text before the price on the same line");
    for (const item of all.slice(Math.max(0, at - 8), at).reverse()) {
      const text = item.text.trim();
      if (!text) continue;
      if (/^#{1,6}\s/.test(text)) {
        add(text.replace(/^#{1,6}\s+/, ""), "nearest heading");
        break;
      }
      if (isNameLike(text)) add(text, "short line before the price");
    }
    if (candidate.section)
      for (const name of [...candidate.section.path].reverse()) add(name, "enclosing heading");
    for (const option of planOptions)
      if (names.has(option.name.toLowerCase()))
        option.source += "; also a vendor structured-data offer";

    return {
      ...candidate,
      id: `p${index}`,
      terms: unglue(terms),
      from,
      pairedWith: null,
      range: false,
      before,
      after,
      planOptions: planOptions.slice(0, 12),
    };
  });
  // Pairs and ranges: only whitespace, "-", "–" or "to" between two money literals.
  for (let index = windows.length - 2; index >= 0; index--) {
    const current = windows[index]!;
    const next = windows[index + 1]!;
    if (current.kind !== "money" || next.kind !== "money") continue;
    const between = markdown.slice(current.end, next.start);
    if (/^\s*(?:[-–—]|to)\s*$/i.test(between)) {
      current.range = true;
      next.range = true;
    } else if (/^[\s\\*]*$/.test(between)) {
      current.pairedWith = "next";
      next.pairedWith = "previous";
      if (!/[A-Za-z]/.test(current.terms)) current.terms = next.terms;
    }
  }
  return windows;
}

/** An explicit page statement that prices are in US dollars, if any. */
export function usdStatement(
  markdown: string,
): { text: string; start: number; end: number } | null {
  const match =
    /[^.\n]*\b(?:billed|charged|priced|paid|payments?|prices?(?: are| shown)?|all prices)\b[^.\n]{0,40}\b(?:in )?(?:United States Dollars|U\.S\. dollars|US dollars|USD)\b[^.\n]*/i.exec(
      markdown,
    );
  return match
    ? { text: match[0].trim(), start: match.index, end: match.index + match[0].length }
    : null;
}
