import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ENV } from "@/env.public";
import { formatDay } from "@/lib/time";
import { orpc } from "@/utils/orpc";

export function WeeklyChangesReport({ cohort, minimum }: { cohort: string; minimum: number }) {
  const weekly = useQuery(orpc.directory.weeklyChanges.queryOptions({ input: { cohort } }));
  if (weekly.isLoading) {
    return (
      <p className="directory-message" role="status">
        Reading comparison history…
      </p>
    );
  }
  if (weekly.isError || !weekly.data) {
    return <p className="directory-message">Weekly history is not available.</p>;
  }
  const report = weekly.data;
  const comparable = report.pairedPages >= minimum && report.uncertainPages === 0;
  return (
    <>
      {/* The headline is the count, not the caveats. A cohort with nothing
          paired yet has no count to headline, and a giant zero there would
          read as a finding rather than as missing history. */}
      {report.pairedPages > 0 ? (
        <section className="change-summary" data-found={report.verifiedPages > 0}>
          <strong>{report.verifiedPages}</strong>
          <span>
            {report.verifiedPages === 1 ? "page has" : "pages have"} a verified commercial change
          </span>
          <small>
            {comparable
              ? `${Math.round((report.verifiedPages / report.pairedPages) * 100)}% of ${report.pairedPages} paired pages`
              : report.uncertainPages > 0
                ? "A rate is withheld while comparisons remain unresolved"
                : `A percentage needs ${minimum} paired pages`}
          </small>
        </section>
      ) : null}
      <p className="chart-footnote">
        {formatDay(report.previousPeriodStart)} – {formatDay(report.periodStart)} compared with{" "}
        {formatDay(report.periodStart)} – {formatDay(report.periodEnd)}, end dates excluded.
      </p>
      <p className="chart-footnote">
        {report.pairedPages} paired · {report.reviewedPages} reviewed · {report.uncertainPages}{" "}
        uncertain · {report.newPages} new · {report.missingPages} missing ·{" "}
        {report.incompatiblePages} incompatible
      </p>
      {report.pairedPages === 0 ? (
        <p className="directory-message">
          Collecting history. This category needs compatible captures in two adjacent completed
          weeks before changes can be compared.
        </p>
      ) : report.items.length === 0 ? (
        <p className="directory-message">
          No verified changes in this period. Coverage and unresolved comparisons are shown above.
        </p>
      ) : (
        report.items.map((item) => (
          <article className="weekly-change" key={`${item.pageId}:${item.key}`}>
            <div className="section-kicker">
              <Link to="/pages/$slug" params={{ slug: item.slug }}>
                {item.name}
              </Link>
              <span>{item.kind === "disclosure" ? "DISCLOSURE CHANGE" : "COMMERCIAL CHANGE"}</span>
            </div>
            <h3>{item.label}</h3>
            <p className="change-transition">
              <span>{item.beforeLabel}</span>
              <em aria-hidden="true">→</em>
              <strong>{item.afterLabel}</strong>
            </p>
            <div className="weekly-evidence">
              <div>
                <a href={sourceUrl(item.beforeSourceUrl)} target="_blank" rel="noreferrer">
                  Before · {formatDay(item.beforeCapturedAt)}
                </a>
                <blockquote>{item.beforeEvidence}</blockquote>
              </div>
              <div>
                <a href={sourceUrl(item.afterSourceUrl)} target="_blank" rel="noreferrer">
                  After · {formatDay(item.afterCapturedAt)}
                </a>
                <blockquote>{item.afterEvidence}</blockquote>
              </div>
            </div>
          </article>
        ))
      )}
    </>
  );
}

function sourceUrl(path: string) {
  return `${ENV.VITE_SERVER_URL.replace(/\/$/, "")}${path}`;
}
