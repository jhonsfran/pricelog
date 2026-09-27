import { Badge } from "@pricelog/ui/components/badge";
import { cn } from "@pricelog/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { formatDay } from "@/lib/time";
import { serverUrl } from "@/lib/url";
import { orpc } from "@/utils/orpc";
import { Disclosure, Evidence, Notice, StatRow } from "./page";
import { Panel } from "./panel";

export function WeeklyChangesReport({ cohort, minimum }: { cohort: string; minimum: number }) {
  const weekly = useQuery(orpc.directory.weeklyChanges.queryOptions({ input: { cohort } }));
  if (weekly.isLoading) {
    return <Notice loading>Reading comparison history…</Notice>;
  }
  if (weekly.isError || !weekly.data) {
    return <Notice>Weekly history is not available.</Notice>;
  }
  const report = weekly.data;
  const comparable = report.pairedPages >= minimum && report.uncertainPages === 0;
  const found = report.verifiedPages > 0;
  return (
    <>
      {/* The headline is the count, not the caveats. A cohort with nothing
          paired yet has no count to headline, and a giant zero there would
          read as a finding rather than as missing history. */}
      {report.pairedPages > 0 ? (
        <section className="grid gap-1.5 pt-9 pb-6">
          {/* A zero is a result; a number above zero is the news. */}
          <strong
            className={cn(
              "text-7xl leading-[0.9] font-[650] tracking-[-0.045em] tabular-nums sm:text-8xl",
              found ? "text-primary" : "text-foreground",
            )}
          >
            {report.verifiedPages}
          </strong>
          <span className="text-lg font-medium">
            {report.verifiedPages === 1 ? "page has" : "pages have"} a verified commercial change
          </span>
          <small className="text-sm text-muted-foreground">
            {comparable
              ? `${Math.round((report.verifiedPages / report.pairedPages) * 100)}% of ${report.pairedPages} paired pages`
              : report.uncertainPages > 0
                ? "A rate is withheld while comparisons remain unresolved"
                : `A percentage needs ${minimum} paired pages`}
          </small>
        </section>
      ) : null}
      <p className="mt-4 font-mono text-xs text-muted-foreground">
        {formatDay(report.previousPeriodStart)} – {formatDay(report.periodStart)} compared with{" "}
        {formatDay(report.periodStart)} – {formatDay(report.periodEnd)}, end dates excluded.
      </p>
      <Disclosure summary="Comparison coverage">
        <StatRow
          items={[
            { label: "Paired", value: report.pairedPages },
            { label: "Reviewed", value: report.reviewedPages },
            { label: "Uncertain", value: report.uncertainPages },
            { label: "New", value: report.newPages },
            { label: "Missing", value: report.missingPages },
            { label: "Incompatible", value: report.incompatiblePages },
          ]}
        />
      </Disclosure>
      {report.pairedPages === 0 ? (
        <Notice>
          Collecting history. This category needs compatible captures in two adjacent completed
          weeks before changes can be compared.
        </Notice>
      ) : report.items.length === 0 ? (
        <Notice>
          No verified changes in this period. Coverage and unresolved comparisons are shown above.
        </Notice>
      ) : (
        report.items.map((item) => (
          <Panel layered role="article" key={`${item.pageId}:${item.key}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                className="text-base font-semibold hover:underline"
                to="/pages/$slug"
                params={{ slug: item.slug }}
                search={{ cohort }}
              >
                {item.slug}
              </Link>
              <Badge
                variant={item.kind === "disclosure" ? "outline" : "default"}
                className="kicker text-2xs"
              >
                {item.kind === "disclosure" ? "Disclosure change" : "Commercial change"}
              </Badge>
            </div>
            <div>
              <h3 className="text-lg">{item.label}</h3>
              <p className="mt-2 flex flex-wrap items-baseline gap-3 font-mono text-base tabular-nums">
                <span className="text-muted-foreground">{item.beforeLabel}</span>
                <span className="text-gray-8" aria-hidden="true">
                  →
                </span>
                <strong className="font-medium text-brand-11">{item.afterLabel}</strong>
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <EvidenceSource
                label="Before"
                capturedAt={item.beforeCapturedAt}
                href={serverUrl(item.beforeSourceUrl)}
                text={item.beforeEvidence}
              />
              <EvidenceSource
                label="After"
                capturedAt={item.afterCapturedAt}
                href={serverUrl(item.afterSourceUrl)}
                text={item.afterEvidence}
              />
            </div>
          </Panel>
        ))
      )}
    </>
  );
}

function EvidenceSource({
  label,
  capturedAt,
  href,
  text,
}: {
  label: string;
  capturedAt: Date | string | number;
  href: string;
  text: string;
}) {
  return (
    <div className="grid content-start gap-3">
      <a
        className="kicker w-fit text-muted-foreground hover:text-foreground"
        href={href}
        target="_blank"
        rel="noreferrer"
      >
        {label} · {formatDay(capturedAt)} ↗
      </a>
      <Evidence>{text}</Evidence>
    </div>
  );
}
