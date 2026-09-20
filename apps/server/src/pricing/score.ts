export const TRUNCATION_MARKER = "\n\n[... content truncated ...]\n\n";

export function budgetMarkdown(markdown: string): string {
  if (markdown.length <= 24_000) return markdown;
  return `${markdown.slice(0, 16_000)}${TRUNCATION_MARKER}${markdown.slice(-8_000)}`;
}

export function normalizeJevScore(score: number): number {
  const bounded = Math.max(0, Math.min(4, score));
  return Math.round((bounded / 4) * 1_000) / 10;
}

export function calculateOverallScore(scores: number[]): number {
  if (scores.length === 0) return 0;
  return Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10;
}
