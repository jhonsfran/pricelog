import type { PageContext, UiControl } from "./page-context";

/** A heading section of the archived Markdown. Offsets index the capture exactly. */
export type Section = {
  id: string;
  level: number;
  heading: string;
  start: number;
  end: number;
  path: string[];
};

export type PriceCandidate = {
  id: string;
  kind: "money" | "state";
  /** Verbatim literal, e.g. "$40 / user / mo." or "Custom". */
  text: string;
  start: number;
  end: number;
  amount: string | null;
  currencyMark: string | null;
  /** Text after the amount on the same literal, e.g. "/ user / mo.". */
  suffix: string;
  section: Section;
};

export type LocatedControl = UiControl & { start: number; section: Section | null };

const SPACE = "[ \\t\\u00a0\\u200a\\u202f]";
const CURRENCY = "(?:US\\$|USD|EUR|GBP|[$€£])";
const NUMBER = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?";
const SUFFIX = `(?:${SPACE}*(?:\\/|per\\b)${SPACE}*[A-Za-z][A-Za-z.]*(?:${SPACE}[A-Za-z][A-Za-z.]*)?){0,3}`;
const MONEY = new RegExp(
  `(${CURRENCY})${SPACE}?(${NUMBER})(?![\\d%])(${SUFFIX})|(${NUMBER})${SPACE}?(€|EUR|USD|GBP)(?![A-Za-z])(${SUFFIX})`,
  "g",
);
const STATE_LINE =
  /^[ \t]*(?:\*\*)?(free|custom|custom pricing|contact sales|contact us|let's talk|talk to sales|get a quote)(?:\*\*)?[ \t]*$/gim;

export function sections(markdown: string): Section[] {
  const headings = [...markdown.matchAll(/^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/gm)];
  const result: Section[] = [];
  const stack: Section[] = [];
  headings.forEach((match, index) => {
    const level = match[1]!.length;
    const start = match.index;
    let end = markdown.length;
    for (const next of headings.slice(index + 1)) {
      if (next[1]!.length <= level) {
        end = next.index;
        break;
      }
    }
    while (stack.length && stack.at(-1)!.level >= level) stack.pop();
    const heading = match[2]!.replace(/[↓↑]+$/u, "").trim();
    const section: Section = {
      id: `s${result.length}`,
      level,
      heading,
      start,
      end,
      path: [...stack.map((item) => item.heading), heading],
    };
    stack.push(section);
    result.push(section);
  });
  return result;
}

/** The deepest section that contains an offset. */
export function sectionAt(all: Section[], offset: number): Section | null {
  let found: Section | null = null;
  for (const section of all)
    if (section.start <= offset && offset < section.end && (!found || section.level > found.level))
      found = section;
  return found;
}

export function priceCandidates(markdown: string, all: Section[]): PriceCandidate[] {
  const found: Omit<PriceCandidate, "id">[] = [];
  for (const match of markdown.matchAll(MONEY)) {
    const section = sectionAt(all, match.index);
    if (!section) continue;
    const prefix = match[1] !== undefined;
    const amount = (prefix ? match[2] : match[4])!.replaceAll(",", "");
    const suffix = (prefix ? match[3] : match[6]) ?? "";
    const text = match[0].replace(new RegExp(`${SPACE}+$`), "");
    found.push({
      kind: "money",
      text,
      start: match.index,
      end: match.index + text.length,
      amount,
      currencyMark: (prefix ? match[1] : match[5])!,
      suffix: suffix.trim(),
      section,
    });
  }
  for (const match of markdown.matchAll(STATE_LINE)) {
    const text = match[1]!;
    const start = match.index + match[0].indexOf(text);
    const section = sectionAt(all, start);
    // A price state is only a price when it stands inside a heading section, as on a plan card.
    if (!section || section.level < 2) continue;
    found.push({
      kind: "state",
      text,
      start,
      end: start + text.length,
      amount: null,
      currencyMark: null,
      suffix: "",
      section,
    });
  }
  return found
    .sort((a, b) => a.start - b.start)
    .map((candidate, index) => ({ ...candidate, id: `p${index}` }));
}

/** Find each UI control in the Markdown by its concatenated option labels. */
export function locateControls(
  markdown: string,
  all: Section[],
  context: PageContext,
): LocatedControl[] {
  const located: LocatedControl[] = [];
  for (const control of context.controls) {
    const joined = control.options.map((option) => option.label).join("");
    let start = joined ? markdown.indexOf(joined) : -1;
    if (start < 0 && control.options.length === 1)
      start = markdown.indexOf(control.options[0]!.label);
    if (start < 0) continue;
    located.push({ ...control, start, section: sectionAt(all, start) });
  }
  return located;
}

export function describeControl(control: UiControl): string {
  if (control.kind === "switch") {
    const option = control.options[0]!;
    return `Switch "${option.label}" is ${option.selected ? "on" : "off"}.`;
  }
  return `Options ${control.options
    .map((option) => `"${option.label}"${option.selected ? " (selected)" : " (not selected)"}`)
    .join(", ")}.`;
}

/** Card text for Jev: the section verbatim, minus link targets and images. */
export function cardText(markdown: string, section: Section, limit = 1500): string {
  const text = markdown
    .slice(section.start, section.end)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}
