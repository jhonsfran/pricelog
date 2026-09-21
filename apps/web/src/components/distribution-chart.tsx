import type { CSSProperties } from "react";

/** Ranked shares with the count kept visible, because a percentage hides its n. */
export function ShareBars({
  title,
  question,
  answered,
  items,
  minimum = 10,
}: {
  title: string;
  question?: string;
  answered: number;
  minimum?: number;
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
                  "--fill": answered >= minimum ? item.count / answered : 0,
                  "--fill-delay": `${Math.min(index, 8) * 30}ms`,
                } as CSSProperties
              }
            >
              <span className="share-name">{item.label}</span>
              <span className="share-track" aria-hidden="true">
                <span />
              </span>
              <span className="share-value">
                {answered >= minimum ? `${Math.round((item.count / answered) * 100)}%` : item.count}
                <small>{answered >= minimum ? `${item.count} pages` : "pages"}</small>
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="share-denominator">
        {answered} applicable classified pages.{" "}
        {answered < minimum
          ? `Percentages need at least ${minimum}.`
          : "Percentages use this denominator."}
      </p>
    </section>
  );
}
