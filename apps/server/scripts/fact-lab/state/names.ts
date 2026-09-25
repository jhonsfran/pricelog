import type { LocatedControl } from "./cards";
import { cleanName, lines, type Line, type PriceWindow } from "./windows";

/**
 * Plan-name candidates (engine v5). Code proposes every heading, short line and same-line
 * prefix near a price; Jev answers one Noul per distinct name; code attributes each price
 * to the nearest preceding name that passed.
 */
export type NameCandidate = {
  id: string;
  name: string;
  /** Every place the name occurs as a candidate, by line index. */
  lines: number[];
  context: string[];
};

const HEADING = /^#{1,6}\s+(.+?)\s*#*\s*$/;
const FILLER =
  /^(?:from|per|plus|or|and|each|only|starting at|up to|\+|\\\+|billed .*|monthly|yearly|annually|popular|new|most popular|best value|recommended|includes?:?|everything in .*)$/i;

function nameOf(text: string): string | null {
  const heading = HEADING.exec(text);
  const name = cleanName(heading ? heading[1]! : text);
  if (!name || name.length > 60 || FILLER.test(name) || !/[A-Za-z]{2,}/.test(name)) return null;
  if (!heading) {
    if (/[.!:,;]$/.test(name) || name.split(/\s+/).length > 6) return null;
    if (/^[-*+•✓✔]|^\[.*\]\(.*\)$|[$€£]\s?\d|\d\s*(?:%|x\b)/.test(text.trim())) return null;
  }
  return name;
}

export type Attribution = {
  names: NameCandidate[];
  /** Candidate name ids to try for each price, nearest first. */
  order: Map<string, { id: string; heading: boolean }[]>;
};

export function nameCandidates(
  markdown: string,
  windows: PriceWindow[],
  controls: LocatedControl[],
  reach = 10,
): Attribution {
  const all: Line[] = lines(markdown);
  const byName = new Map<string, NameCandidate>();
  const order = new Map<string, { id: string; heading: boolean }[]>();
  const add = (name: string, lineIndex: number) => {
    const key = name.toLowerCase().replace(/\s+/g, " ");
    let candidate = byName.get(key);
    if (!candidate) {
      candidate = {
        id: `n${byName.size}`,
        name,
        lines: [],
        context: all
          .slice(Math.max(0, lineIndex - 2), lineIndex + 3)
          .map((line) => line.text.trim())
          .filter(Boolean)
          .slice(0, 5),
      };
      byName.set(key, candidate);
    }
    if (!candidate.lines.includes(lineIndex)) candidate.lines.push(lineIndex);
    return candidate;
  };
  const lineOf = (offset: number) =>
    all.findIndex((line) => line.start <= offset && offset <= line.end);

  for (const window of windows) {
    const at = lineOf(window.start);
    const sequence: { id: string; heading: boolean }[] = [];
    const prefix = markdown.slice(all[at]!.start, window.start).trim();
    const prefixName = prefix ? nameOf(prefix) : null;
    if (prefixName) sequence.push({ id: add(prefixName, at).id, heading: false });
    for (const control of controls)
      if (
        control.section &&
        window.section &&
        control.section.id === window.section.id &&
        control.start < window.start
      )
        for (const option of control.options)
          if (option.selected)
            sequence.push({ id: add(option.label, lineOf(control.start)).id, heading: false });
    let seen = 0;
    for (let index = at - 1; index >= 0 && seen < reach; index--) {
      const text = all[index]!.text.trim();
      if (!text) continue;
      seen++;
      const name = nameOf(text);
      if (!name) continue;
      const heading = HEADING.test(text);
      sequence.push({ id: add(name, index).id, heading });
      if (heading) break;
    }
    order.set(window.id, sequence);
  }
  return { names: [...byName.values()], order };
}
