import type { PageContext, UiControl } from "./page-context";

/** Heading sections of the archived Markdown, and where each UI control sits in them. */

/** A heading section of the archived Markdown. Offsets index the capture exactly. */
export type Section = {
  id: string;
  level: number;
  heading: string;
  start: number;
  end: number;
  path: string[];
};

export type LocatedControl = UiControl & { start: number; section: Section | null };

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
