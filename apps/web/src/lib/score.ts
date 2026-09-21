export type ScoreBand = "high" | "mid" | "low" | "none";

/**
 * One place decides what a score looks like. Every number, meter and rule
 * in the app reads its colour from the `data-band` attribute this returns,
 * so a 38 is never the same colour as an 84 anywhere in the product.
 */
export function scoreBand(score: number | null | undefined): ScoreBand {
  if (score === null || score === undefined || Number.isNaN(score)) return "none";
  if (score >= 75) return "high";
  if (score >= 50) return "mid";
  return "low";
}

/** Bars fill from a 0..1 scale. Clamp so a bad payload cannot overflow the track. */
export function fillRatio(score: number) {
  return Math.max(0, Math.min(1, score / 100)).toFixed(4);
}

/**
 * Stagger is decoration. Capping it keeps a 50-row page from taking two
 * seconds to finish arriving, and keeps page 2 of an infinite list from
 * inheriting page 1's accumulated delay.
 */
export function staggerDelay(index: number, step = 26, cap = 10) {
  return `${Math.min(index, cap) * step}ms`;
}
