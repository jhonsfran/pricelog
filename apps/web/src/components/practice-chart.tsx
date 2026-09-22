import type { CSSProperties, ReactNode } from "react";

export type ChartRow = {
  key: string;
  label: string;
  /** 0–1. Drives the bar only; the printed value is passed separately. */
  fill: number;
  display: string;
};

/**
 * One question, drawn as a ranked column of bars. Ranking matters: the
 * top row is the finding, so it is the only row that gets the attention
 * colour. Everything a reader needs to audit the number — counts,
 * definitions, sources — goes behind the disclosure rather than
 * competing with the shape.
 */
export function PracticeChart({
  title,
  question,
  rows,
  footnote,
  children,
}: {
  title: string;
  question?: string;
  rows: ChartRow[];
  footnote?: string;
  children?: ReactNode;
}) {
  const ranked = [...rows].sort((left, right) => right.fill - left.fill);
  return (
    <section className="chart-block">
      <h3 className="chart-title">{title}</h3>
      {question ? <p className="chart-question">{question}</p> : null}
      {ranked.length === 0 ? (
        <p className="chart-empty">No page in this cohort has a confident answer.</p>
      ) : (
        <ol className="chart-rows">
          {ranked.map((row, index) => (
            <li
              className="chart-row"
              key={row.key}
              data-lead={index === 0 && row.fill > 0}
              style={
                {
                  "--fill": row.fill,
                  "--fill-delay": `${Math.min(index, 8) * 40}ms`,
                } as CSSProperties
              }
            >
              <span className="chart-label">{row.label}</span>
              <span className="chart-track" aria-hidden="true">
                <span />
              </span>
              <span className="chart-value">{row.display}</span>
            </li>
          ))}
        </ol>
      )}
      {footnote ? <p className="chart-footnote">{footnote}</p> : null}
      {children ? (
        <details className="chart-detail">
          <summary>Counts, definitions and sources</summary>
          <div>{children}</div>
        </details>
      ) : null}
    </section>
  );
}
