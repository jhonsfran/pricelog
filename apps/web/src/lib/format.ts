const ACRONYMS: Record<string, string> = { ai: "AI", api: "API", apis: "APIs", hr: "HR", gb: "GB" };

/** "ai_native" → "AI native": sentence case, with acronyms kept whole. */
export function formatToken(value: string) {
  const words = value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => ACRONYMS[word.toLowerCase()] ?? word.toLowerCase());
  const [first = "", ...rest] = words;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(" ");
}
