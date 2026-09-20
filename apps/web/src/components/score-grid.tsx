import {
  PRICING_SCORE_CATALOG,
  type PricingScoreKey,
} from "@my-better-t-app/api/pricing-intelligence";

export type DisplayScore = { key: PricingScoreKey; score: number; confidence: number };

function scoreLabel(key: PricingScoreKey): string {
  return PRICING_SCORE_CATALOG[key].label;
}

export function ScoreGrid({ scores }: { scores: DisplayScore[] }) {
  return (
    <div className="score-grid">
      {scores.map((item, index) => (
        <div className="score-row" key={item.key} style={{ animationDelay: `${index * 45}ms` }}>
          <div className="score-meta">
            <span>{scoreLabel(item.key)}</span>
            <span className="score-number">{Math.round(item.score)}</span>
          </div>
          <div
            className="score-track"
            role="progressbar"
            aria-label={scoreLabel(item.key)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(item.score)}
          >
            <span style={{ width: `${Math.max(0, Math.min(100, item.score))}%` }} />
          </div>
          <span className="score-confidence">{Math.round(item.confidence * 100)}% confidence</span>
        </div>
      ))}
    </div>
  );
}
