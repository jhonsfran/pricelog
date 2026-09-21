import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ENV } from "@/env.public";
import { orpc } from "@/utils/orpc";

export function WeeklyChangesReport({ cohort, minimum }: { cohort: string; minimum: number }) {
  const weekly = useQuery(orpc.directory.weeklyChanges.queryOptions({ input: { cohort } }));
  return (
    <section className="benchmark-section">
      <div className="section-kicker">
        <span>WEEKLY CHANGES</span>
        <span>COMPLETED UTC WEEKS</span>
      </div>
      {weekly.isLoading ? (
        <p role="status">Reading comparison history…</p>
      ) : weekly.isError ? (
        <p>Weekly history is not available.</p>
      ) : weekly.data ? (
        <>
          <p className="benchmark-meta">
            {formatDate(weekly.data.previousPeriodStart)} to {formatDate(weekly.data.periodStart)},
            compared with {formatDate(weekly.data.periodStart)} to{" "}
            {formatDate(weekly.data.periodEnd)}, end dates excluded.
          </p>
          <p className="benchmark-meta">
            {weekly.data.pairedPages} paired pages · {weekly.data.reviewedPages} reviewed ·{" "}
            {weekly.data.uncertainPages} uncertain · {weekly.data.newPages} new ·{" "}
            {weekly.data.missingPages} missing · {weekly.data.incompatiblePages} incompatible
          </p>
          {weekly.data.pairedPages === 0 ? (
            <p>
              Collecting history. This category needs compatible captures in two adjacent completed
              weeks before changes can be compared.
            </p>
          ) : (
            <>
              <p>
                {weekly.data.verifiedPages}{" "}
                {weekly.data.verifiedPages === 1 ? "page has" : "pages have"} a verified commercial
                change
                {weekly.data.pairedPages >= minimum && weekly.data.uncertainPages === 0
                  ? `, ${Math.round((weekly.data.verifiedPages / weekly.data.pairedPages) * 100)}% of ${weekly.data.pairedPages} paired pages`
                  : weekly.data.uncertainPages > 0
                    ? ". A rate is withheld while comparisons remain unresolved"
                    : `. A percentage needs ${minimum} paired pages`}
                .
              </p>
              {weekly.data.items.length === 0 ? (
                <p>
                  No verified changes are available for this period. Coverage and unresolved
                  comparisons are shown above.
                </p>
              ) : (
                weekly.data.items.map((item) => (
                  <article className="weekly-change" key={`${item.pageId}:${item.key}`}>
                    <div className="section-kicker">
                      <Link to="/pages/$slug" params={{ slug: item.slug }}>
                        {item.name}
                      </Link>
                      <span>
                        {item.kind === "disclosure" ? "DISCLOSURE CHANGE" : "COMMERCIAL CHANGE"}
                      </span>
                    </div>
                    <h3>{item.label}</h3>
                    <p>
                      {item.beforeLabel} → {item.afterLabel}
                    </p>
                    <div className="weekly-evidence">
                      <div>
                        <a href={sourceUrl(item.beforeSourceUrl)} target="_blank" rel="noreferrer">
                          Before · {formatDate(item.beforeCapturedAt)}
                        </a>
                        <blockquote>{item.beforeEvidence}</blockquote>
                      </div>
                      <div>
                        <a href={sourceUrl(item.afterSourceUrl)} target="_blank" rel="noreferrer">
                          After · {formatDate(item.afterCapturedAt)}
                        </a>
                        <blockquote>{item.afterEvidence}</blockquote>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </>
          )}
        </>
      ) : null}
    </section>
  );
}
function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(value),
  );
}
function sourceUrl(path: string) {
  return `${ENV.VITE_SERVER_URL.replace(/\/$/, "")}${path}`;
}
