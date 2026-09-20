const SCORE_LABELS: Record<string, string> = {
  pricing_transparency: "Transparency",
  pricing_clarity: "Clarity",
  pricing_completeness: "Completeness",
  plan_comparability: "Comparability",
  purchase_actionability: "Actionability",
};

export type DisplayScore = { key: string; score: number; confidence: number };

export function ScoreGrid({ scores }: { scores: DisplayScore[] }) {
  return (
    <div className="score-grid">
      {scores.map((item, index) => (
        <div className="score-row" key={item.key} style={{ animationDelay: `${index * 45}ms` }}>
          <div className="score-meta">
            <span>{SCORE_LABELS[item.key] ?? item.key}</span>
            <span className="score-number">{Math.round(item.score)}</span>
          </div>
          <div
            className="score-track"
            role="progressbar"
            aria-label={SCORE_LABELS[item.key] ?? item.key}
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
