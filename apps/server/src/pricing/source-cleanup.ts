const CONSENT_START =
  /^(?:this (?:web)?site uses cookies\b|we use cookies\b|cookie consent(?: preferences)?$|customize consent preferences$)/i;
const COOKIE_REPORT = /^cookie report$/i;
const COOKIE_TABLE =
  /^\|\s*name\s*\|\s*provider\s*\/\s*domain\s*\|\s*expiration\s*\|\s*description\s*\|/i;
const ACCEPT_ALL = /\baccept all\b/i;
const REJECT_ALL = /\b(?:reject|decline) all\b/i;
const CONTENT_HEADING = /^#{1,6}\s+\S/;
const MAIN_HEADING = /^#\s+\S/;
const CLOSE_IMAGE = /^!\[[^\]]*\]\([^)]*\bclose\.(?:svg|png|webp)(?:\?[^)]*)?\)$/i;

/** Remove only cookie UI blocks with enough structure to identify their bounds. */
export function trimCookieConsentMarkdown(markdown: string): string {
  let result = markdown;
  for (;;) {
    const lines = result.split("\n");
    const region = cookieRegion(lines);
    if (!region) return result;
    const [start, end] = region;
    const before = lines.slice(0, start).join("\n").trimEnd();
    const after = lines.slice(end).join("\n").trimStart();
    const hadBlankLine = !lines[start - 1]?.trim() || !lines[end]?.trim();
    result = [before, after].filter(Boolean).join(hadBlankLine ? "\n\n" : "\n");
  }
}

type AccessibleNode = {
  role?: unknown;
  name?: unknown;
  children?: unknown;
};

/** Restore price labels that rendered Markdown omits from accessible image widgets. */
export function addAccessiblePriceLabels(markdown: string, tree: unknown): string {
  if (!isNode(tree)) return markdown;
  const headings = [...markdown.matchAll(/^(#{2,5})\s+(.+?)\s*$/gm)];
  if (!headings.length) return markdown;

  const labels = new Map<string, Set<string>>();
  const visit = (node: AccessibleNode, ancestors: AccessibleNode[]) => {
    if (node.role === "img" && typeof node.name === "string" && isPriceLabel(node.name)) {
      for (const ancestor of [...ancestors].reverse()) {
        if (ancestor.role === "RootWebArea") break;
        const before = precedingHeadings(ancestor, node);
        if (before.length !== 1) continue;
        const heading = before[0]!;
        const matched = headings.find(
          (item) => item[2]?.trim().toLowerCase() === heading.toLowerCase(),
        );
        if (!matched) continue;
        const sectionStart = matched.index + matched[0].length;
        const next = headings.find((item) => item.index > matched.index);
        const section = markdown.slice(
          sectionStart,
          Math.min(next?.index ?? markdown.length, sectionStart + 500),
        );
        if (!section.includes(node.name)) {
          const values = labels.get(heading) ?? new Set<string>();
          values.add(node.name);
          labels.set(heading, values);
        }
        break;
      }
    }
    for (const child of children(node)) visit(child, [...ancestors, node]);
  };
  visit(tree, []);
  if (!labels.size) return markdown;

  const insertions: { index: number; text: string }[] = [];
  for (const [heading, values] of labels) {
    const match = headings.find((item) => item[2]?.trim().toLowerCase() === heading.toLowerCase());
    if (!match) continue;
    const end = match.index + match[0].length;
    const newlines = /^\n*/.exec(markdown.slice(end))?.[0].length ?? 0;
    insertions.push({
      index: end + newlines,
      text: `${newlines ? "" : "\n\n"}${[...values].join("\n")}\n\n`,
    });
  }
  // A bounded supplement prevents a large accessibility tree from changing
  // the source transport budget or dominating the evaluation.
  if (insertions.length > 32 || insertions.reduce((sum, item) => sum + item.text.length, 0) > 4096)
    return markdown;
  let result = markdown;
  for (const item of insertions.sort((a, b) => b.index - a.index)) {
    result = result.slice(0, item.index) + item.text + result.slice(item.index);
  }
  return result;
}

function isNode(value: unknown): value is AccessibleNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function children(node: AccessibleNode): AccessibleNode[] {
  return Array.isArray(node.children) ? node.children.filter(isNode) : [];
}

function isPriceLabel(value: string): boolean {
  return /^(?:(?:USD|EUR|GBP)\s*)?[$€£]\s*(?:0|[1-9]\d{0,8})(?:\.\d{1,6})?$/.test(value.trim());
}

function precedingHeadings(container: AccessibleNode, target: AccessibleNode): string[] {
  const found: string[] = [];
  const walk = (node: AccessibleNode): boolean => {
    if (node === target) return true;
    if (node.role === "heading" && typeof node.name === "string") found.push(node.name.trim());
    for (const child of children(node)) if (walk(child)) return true;
    return false;
  };
  walk(container);
  return found;
}

function cookieRegion(lines: string[]): [number, number] | null {
  const firstMainHeading = lines.findIndex((line) => MAIN_HEADING.test(line));
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!.trim();
    if (COOKIE_REPORT.test(line)) {
      const table = lines
        .slice(index + 1, index + 5)
        .some((next) => COOKIE_TABLE.test(next.trim()));
      if (table && !lines.slice(index + 1).some((next) => CONTENT_HEADING.test(next))) {
        return [index, lines.length];
      }
      continue;
    }
    if (!CONSENT_START.test(line)) continue;

    const nextHeading = lines.findIndex(
      (next, offset) => offset > index && CONTENT_HEADING.test(next),
    );
    const searchEnd = Math.min(
      lines.length,
      index + 250,
      nextHeading < 0 ? lines.length : nextHeading,
    );
    const consentLines = lines.slice(index, searchEnd);
    const hasAccept = consentLines.some((next) => ACCEPT_ALL.test(next));
    const hasReject = consentLines.some((next) => REJECT_ALL.test(next));
    if (!hasAccept || !hasReject) continue;

    let start = index;
    if (index >= 2 && !lines[index - 1]!.trim() && CLOSE_IMAGE.test(lines[index - 2]!.trim())) {
      start = index - 2;
    }

    const combinedAction = consentLines.findLastIndex(
      (next) => ACCEPT_ALL.test(next) && REJECT_ALL.test(next),
    );
    if (combinedAction >= 0) return [start, index + combinedAction + 1];

    if (firstMainHeading > index && firstMainHeading === nextHeading) {
      return [start, firstMainHeading];
    }
    if (nextHeading < 0 && firstMainHeading >= 0 && index > firstMainHeading) {
      return [start, lines.length];
    }
  }
  return null;
}
