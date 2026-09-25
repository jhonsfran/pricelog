import type { LocatedControl } from "./cards";
import { cleanName, lines, type Line, type PriceWindow } from "./windows5";

/**
 * Plan-name candidates, v5 (engine v16): same as v4 on price windows v5.
 * Plan-name candidates, v4 (engine v14): uses windows v4 cleanName (mixed-case badges).
 * Plan-name candidates, v3 (engine v8): names must start with a capital letter or digit,
 * which drops lowercase fragments such as "outcome" or "per month".
 * Plan-name candidates, v2 (engine v6).
 * - Selected tier options anywhere in the price's section count (tabs often follow the price).
 * - The backward walk stops at another price's line. A sibling price on that line in the same
 *   section lends its plan; a table header row with a glued price state ends the walk.
 */
export type NameCandidate = { id: string; name: string; lines: number[]; context: string[] };
export type Step =
  | { type: "name"; id: string; heading: boolean }
  | { type: "sibling"; window: string };

const HEADING = /^#{1,6}\s+(.+?)\s*#*\s*$/;
const MONEY = /(?:US\$|USD|EUR|GBP|[$€£])[ \t   ]?\d|\d[ \t   ]?(?:€|EUR|USD|GBP)\b/;
const GLUED_STATE =
  /(?:free|custom|contact sales|contact us|let's talk|talk to sales|get a quote)$/i;
const BILLING =
  /^(?:monthly|yearly|annual|annually|month|year|billed (?:monthly|yearly|annually))$/i;
const FILLER =
  /^(?:from|per|plus|or|and|each|only|starting at|up to|\+|\\\+|billed .*|monthly|yearly|annually|popular|new|most popular|best value|recommended|includes?:?|everything in .*)$/i;

function nameOf(text: string): string | null {
  const heading = HEADING.exec(text);
  const name = cleanName(heading ? heading[1]! : text);
  if (!name || name.length > 60 || FILLER.test(name) || !/[A-Za-z]{2,}/.test(name)) return null;
  if (!/^[A-Z0-9]/.test(name)) return null;
  if (!heading) {
    if (/[.!:,;]$/.test(name) || name.split(/\s+/).length > 6) return null;
    if (/^[-*+•✓✔]|^\[.*\]\(.*\)$|\d\s*(?:%|x\b)/.test(text.trim())) return null;
  }
  return name;
}

/** A line that states some price: a money literal, or a name with a glued price state. */
function isPriceLine(text: string): boolean {
  const trimmed = cleanName(text);
  return (
    MONEY.test(text) || (GLUED_STATE.test(trimmed) && trimmed.length > 0 && !HEADING.test(text))
  );
}

export type Attribution = { names: NameCandidate[]; steps: Map<string, Step[]> };

export function nameCandidates(
  markdown: string,
  windows: PriceWindow[],
  controls: LocatedControl[],
  reach = 10,
  contextLines = 3,
): Attribution {
  const all: Line[] = lines(markdown);
  const byName = new Map<string, NameCandidate>();
  const steps = new Map<string, Step[]>();
  const add = (name: string, lineIndex: number) => {
    const key = name.toLowerCase().replace(/\s+/g, " ");
    let candidate = byName.get(key);
    if (!candidate) {
      const half = Math.floor(contextLines / 2);
      candidate = {
        id: `n${byName.size}`,
        name,
        lines: [],
        context: all
          .slice(Math.max(0, lineIndex - half - 2), lineIndex + half + 3)
          .map((line) => line.text.trim())
          .filter(Boolean)
          .slice(0, contextLines),
      };
      byName.set(key, candidate);
    }
    if (!candidate.lines.includes(lineIndex)) candidate.lines.push(lineIndex);
    return candidate;
  };
  const lineOf = (offset: number) =>
    all.findIndex((line) => line.start <= offset && offset <= line.end);
  const windowsByLine = new Map<number, PriceWindow[]>();
  for (const window of windows) {
    const at = lineOf(window.start);
    windowsByLine.set(at, [...(windowsByLine.get(at) ?? []), window]);
  }

  for (const window of windows) {
    const at = lineOf(window.start);
    const sequence: Step[] = [];
    const prefix = markdown.slice(all[at]!.start, window.start).trim();
    const prefixName = prefix && !MONEY.test(prefix) ? nameOf(prefix) : null;
    if (prefixName) sequence.push({ type: "name", id: add(prefixName, at).id, heading: false });
    for (const control of controls)
      if (
        control.section &&
        window.section &&
        control.section.id === window.section.id &&
        control.kind !== "switch" &&
        !control.options.some((option) => BILLING.test(option.label))
      )
        for (const option of control.options)
          if (option.selected)
            sequence.push({
              type: "name",
              id: add(option.label, lineOf(control.start)).id,
              heading: false,
            });
    // A price that follows another on the same line belongs to the same offer.
    const earlier = (windowsByLine.get(at) ?? []).filter((item) => item.start < window.start);
    if (!prefixName && earlier.length)
      sequence.push({ type: "sibling", window: earlier.at(-1)!.id });
    else {
      let seen = 0;
      for (let index = at - 1; index >= 0 && seen < reach; index--) {
        const text = all[index]!.text.trim();
        if (!text) continue;
        seen++;
        const heading = HEADING.test(text);
        if (!heading && isPriceLine(text)) {
          const sibling = (windowsByLine.get(index) ?? []).find(
            (item) => item.section?.id === window.section?.id,
          );
          if (sibling) sequence.push({ type: "sibling", window: sibling.id });
          break;
        }
        const name = nameOf(text);
        if (!name) continue;
        sequence.push({ type: "name", id: add(name, index).id, heading });
        if (heading) break;
      }
    }
    steps.set(window.id, sequence);
  }
  return { names: [...byName.values()], steps };
}
