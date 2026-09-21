import type { ScoreDistribution } from "@my-better-t-app/api/benchmark";
import type { CSSProperties } from "react";
import { scoreBand } from "@/lib/score";

/**
 * Twenty buckets over 0-100 with the interquartile band behind them and the
 * median marked. A median alone says where the middle is; the shape says
 * whether there is a middle at all.
 */
export function DistributionChart({
  distribution,
  label,
  question,
}: {
  distribution: ScoreDistribution;
  label: string;
  question?: string;
}) {
  const peak = Math.max(...distribution.histogram, 1);
  return (
    <figure className="dist-card" data-band={scoreBand(distribution.median)}>
      <figcaption className="dist-head">
        <span className="dist-label">{label}</span>
        <span className="dist-median">{distribution.median}</span>
      </figcaption>
      {question ? <p className="dist-question">{question}</p> : null}
      <div
        className="dist-chart"
        role="img"
        aria-label={`${label}: median ${distribution.median}, quartiles ${distribution.p25} to ${distribution.p75}, across ${distribution.count} pages`}
      >
        <span
          className="dist-iqr"
          style={
            {
              "--from": `${distribution.p25}%`,
              "--to": `${distribution.p75}%`,
            } as CSSProperties
          }
        />
        <span
          className="dist-median-line"
          style={{ "--at": `${distribution.median}%` } as CSSProperties}
        />
        {distribution.histogram.map((count, index) => (
          <span
            className="dist-bar"
            // Buckets are a fixed 0-100 scale, so the position is the identity.
            key={index}
            style={{ "--fill": count / peak, "--fill-delay": `${index * 12}ms` } as CSSProperties}
          />
        ))}
      </div>
      <div className="dist-axis">
        <span>0</span>
        <span>
          p25 {distribution.p25} · p75 {distribution.p75}
        </span>
        <span>100</span>
      </div>
    </figure>
  );
}

/** Ranked shares with the count kept visible, because a percentage hides its n. */
export function ShareBars({
  title,
  question,
  answered,
  items,
}: {
  title: string;
  question?: string;
  answered: number;
  items: { key: string; label: string; count: number }[];
}) {
  const ranked = [...items].sort((left, right) => right.count - left.count);
  return (
    <section className="share-card">
      <h3 className="share-title">{title}</h3>
      {question ? <p className="dist-question">{question}</p> : null}
      {answered === 0 ? (
        <p className="share-empty">No page in this cohort has a confident answer.</p>
      ) : (
        <ol className="share-list">
          {ranked.map((item, index) => (
            <li
              className="share-row"
              key={item.key}
              style={
                {
                  "--fill": item.count / answered,
                  "--fill-delay": `${Math.min(index, 8) * 30}ms`,
                } as CSSProperties
              }
            >
              <span className="share-name">{item.label}</span>
              <span className="share-track">
                <span />
              </span>
              <span className="share-value">
                {Math.round((item.count / answered) * 100)}%<small>{item.count}</small>
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="share-denominator">
        {answered} of the cohort answered this question with confidence.
      </p>
    </section>
  );
}
