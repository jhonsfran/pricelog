export type NumericCandidate = {
  id: string;
  amount: string;
  start: number;
  end: number;
  evidence: string;
};
/** Parse complete numeric tokens, never fragments of percentages, exponents or malformed grouping. */
export function extractNumericCandidates(source: string): NumericCandidate[] {
  const candidates: NumericCandidate[] = [];
  // Unsupported spacing must suppress the entire number, not expose its separate digit groups.
  const spacedGroups = Array.from(
    source.matchAll(
      /(?<![\w.,])[0-9]+(?:[.,][0-9]+)*(?:[ \t\u00a0\u202f'’]+[0-9]{3})+(?:[.,][0-9]+)?(?![0-9])/g,
    ),
    (match) => ({ start: match.index, end: match.index + match[0].length }),
  );
  for (const match of source.matchAll(/(?:[0-9]+(?:[.,][0-9]+)*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/g)) {
    const raw = match[0];
    const start = match.index;
    const rawEnd = start + raw.length;
    const scale = /^[ \t]*(thousand|million|billion)\b/i.exec(source.slice(rawEnd));
    const end = rawEnd + (scale?.[0].length ?? 0);
    if (spacedGroups.some((group) => start < group.end && end > group.start)) continue;
    if (
      !scale &&
      /^[ \t\u00a0\u202f]+(?:hundred|thousand|million|billion|trillion|k|m|b|t|mn|bn|mm)s?\b/i.test(
        source.slice(end),
      )
    )
      continue;
    if (!/^(?:(?:0|[1-9][0-9]*|[1-9][0-9]{0,2}(?:,[0-9]{3})+)(?:\.[0-9]+)?|\.[0-9]+)$/.test(raw))
      continue;
    if (
      /[\w.,+−-]/.test(source[start - 1] ?? "") ||
      (/^[\w%]/.test(source.slice(end, end + 1)) && !/^per\b/.test(source.slice(end))) ||
      /^\s*%/.test(source.slice(end))
    )
      continue;
    const lineStart = source.lastIndexOf("\n", start - 1) + 1;
    const prefix = source.slice(lineStart, start);
    const markdownBullet = /^[ \t]*-[ \t]+(?:[$€£]|USD|EUR|GBP)[ \t]*$/.test(prefix);
    if (/[-−][ \t]*(?:[$€£]|USD|EUR|GBP)[ \t]*$/.test(prefix) && !markdownBullet) continue;
    const literal = raw.startsWith(".") ? `0${raw}` : raw.replaceAll(",", "");
    const power = scale ? { thousand: 3, million: 6, billion: 9 }[scale[1]!.toLowerCase()]! : 0;
    const amount = power ? scaleDecimal(literal, power) : literal;
    if (
      amount.length > 17 ||
      (amount.split(".")[1]?.length ?? 0) > 6 ||
      Number(amount) > 1_000_000_000
    )
      continue;
    const newline = source.indexOf("\n", end);
    const lineEnd = newline < 0 ? source.length : newline;
    candidates.push({
      id: `n${candidates.length}`,
      amount,
      start,
      end,
      evidence: source.slice(Math.max(lineStart, start - 250), Math.min(lineEnd, end + 250)),
    });
    if (candidates.length > 512) throw new Error("Numeric source exceeds candidate limit");
  }
  // Explicit "per million" denominators have no digit token. Normalize in code.
  for (const match of source.matchAll(/(?:\bper\s+|\/\s*)(thousand|million|billion)\b/gi)) {
    const word = match[1]!;
    const start = match.index + match[0].indexOf(word);
    candidates.push({
      id: `n${candidates.length}`,
      amount: String({ thousand: 1000, million: 1000000, billion: 1000000000 }[word.toLowerCase()]),
      start,
      end: start + word.length,
      evidence: source.slice(Math.max(0, start - 100), start + word.length + 100),
    });
    if (candidates.length > 512) throw new Error("Numeric source exceeds candidate limit");
  }
  return candidates
    .sort((a, b) => a.start - b.start)
    .map((item, index) => ({ ...item, id: `n${index}` }));
}
function scaleDecimal(literal: string, power: number) {
  const [whole, fraction = ""] = literal.split(".");
  const digits = whole + fraction.padEnd(power, "0");
  const split = whole!.length + power;
  return (
    digits.slice(0, split) + (digits.length > split ? `.${digits.slice(split)}` : "")
  ).replace(/^0+(?=\d)/, "");
}
export type TextCandidate = { id: string; text: string; start: number; end: number };

/** Over-find short names; Jev decides whether each literal names a public offer. */
export function offerNameCandidates(source: string): TextCandidate[] {
  const candidates: TextCandidate[] = [];
  const seen = new Set<string>();
  const add = (raw: string, start: number) => {
    const text = raw
      .trim()
      .replace(/^\*\*|\*\*$/g, "")
      .trim();
    if (!text || text.length > 80 || !/[A-Za-z]/.test(text)) return;
    const offset = raw.indexOf(text);
    if (offset < 0 || seen.has(text)) return;
    seen.add(text);
    candidates.push({
      id: `o${candidates.length}`,
      text,
      start: start + offset,
      end: start + offset + text.length,
    });
  };
  for (const match of source.matchAll(/[^\n]+/g)) {
    const line = match[0];
    const heading = /^(?:#{1,6}\s+)(.+?)\s*#*\s*$/.exec(line);
    if (heading) add(heading[1]!, match.index + line.indexOf(heading[1]!));
    else if (line.includes("|")) {
      for (const cell of line.matchAll(/[^|]+/g)) add(cell[0], match.index + cell.index);
    } else {
      add(line, match.index);
      const prefix = /^\s*([A-Za-z][A-Za-z -]{0,60}?)\s+(?:(?:USD|EUR|GBP)\s*)?[$€£]\s*\d/.exec(
        line,
      );
      if (prefix) add(prefix[1]!, match.index + line.indexOf(prefix[1]!));
    }
  }
  if (candidates.length > 128) throw new Error("Offer-name candidate limit exceeded");
  return candidates;
}

/** Paragraphs retain heading and table context through the complete source in state. */
export function evidenceCandidates(source: string): TextCandidate[] {
  const result: TextCandidate[] = [];
  for (const match of source.matchAll(/\S(?:[^\n]|\n(?!\s*\n))*/g)) {
    const text = match[0].trimEnd();
    // Long paragraphs are divided at line boundaries, never silently discarded.
    let start = match.index;
    const end = start + text.length;
    while (start < end) {
      let next = Math.min(end, start + 1800);
      if (next < end) {
        const newline = source.lastIndexOf("\n", next);
        if (newline > start) next = newline;
      }
      const part = source.slice(start, next);
      if (part.trim()) result.push({ id: `e${result.length}`, text: part, start, end: next });
      start = next;
      if (source[start] === "\n") start++;
    }
  }
  if (result.length > 254) throw new Error("Evidence candidate limit exceeded");
  return result;
}

/** A bare dollar marker records no currency denomination. */
export function hasBareDollar(source: string, candidate: NumericCandidate): boolean {
  const before = source.slice(Math.max(0, candidate.start - 16), candidate.start);
  const after = source.slice(candidate.end, candidate.end + 16);
  return (
    (/(?:^|[^A-Za-z])\$\s*$/.test(before) && !/[A-Z]{3}\s*\$\s*$/.test(before)) ||
    (/^\s*\$(?:$|[^A-Za-z])/.test(after) && !/^\s*\$\s*[A-Z]{3}\b/.test(after))
  );
}

/** Unsupported numeric syntax is unresolved, never evidence that a term is unchanged. */
export function unsupportedNumericCount(source: string, candidates: NumericCandidate[]): number {
  let count = 0;
  for (const match of source.matchAll(/(?:[0-9]+(?:[.,][0-9]+)*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/g)) {
    const start = match.index;
    const end = start + match[0].length;
    if (candidates.some((item) => item.start <= start && item.end >= end)) continue;
    // Percent savings and embedded identifiers are outside this numeric rubric.
    if (/[A-Za-z_]/.test(source[start - 1] ?? "") || /^\s*%/.test(source.slice(end))) continue;
    count++;
  }
  return count;
}
