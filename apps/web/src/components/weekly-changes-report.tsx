import type { AppRouterClient } from "@pricelog/api/routers/index";
import { Skeleton } from "@pricelog/ui/components/skeleton";
import { cn } from "@pricelog/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Fragment } from "react";
import { Link } from "@tanstack/react-router";
import { formatDay } from "@/lib/time";
import { serverUrl } from "@/lib/url";
import { orpc } from "@/utils/orpc";
import { Monogram } from "./monogram";
import { Disclosure, Evidence, Notice } from "./page";

type Report = Awaited<ReturnType<AppRouterClient["directory"]["weeklyChanges"]>>;
type Change = Report["items"][number];

const DAY = 86_400_000;
/** Periods end on an excluded midnight, so a week reads to the day before it. */
const lastDay = (end: Date | string) => new Date(new Date(end).getTime() - DAY);

/**
 * The week in one number, the two weeks it compares, then every verified change grouped by the
 * page it happened on. Each change carries the text before and after, from both archives.
 */
export function WeeklyChangesReport({ cohort, minimum }: { cohort: string; minimum: number }) {
  const weekly = useQuery(orpc.directory.weeklyChanges.queryOptions({ input: { cohort } }));
  if (weekly.isLoading)
    return (
      <div className="grid gap-4 pt-8" aria-hidden="true">
        <Skeleton className="h-40" />
        <Skeleton className="h-56" />
      </div>
    );
  if (weekly.isError || !weekly.data) return <Notice>Weekly history is not available.</Notice>;
  const report = weekly.data;
  const comparable = report.pairedPages >= minimum && report.uncertainPages === 0;
  const found = report.verifiedPages > 0;
  const groups = groupByPage(report.items);
  return (
    <>
      <section className="grid gap-8 border-b border-gray-5 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:items-end">
        <div>
          <p className="kicker text-muted-foreground">
            {formatDay(report.periodStart)} – {formatDay(lastDay(report.periodEnd))}
          </p>
          {/* A zero is a result; with nothing paired there is no count to headline, and a giant
              zero would read as a finding rather than as missing history. */}
          {report.pairedPages === 0 ? (
            <p className="mt-3 text-4xl leading-none font-[650] tracking-[-0.035em]">
              Nothing to compare yet
            </p>
          ) : (
            <p className="mt-3 flex items-baseline gap-4">
              <strong
                className={cn(
                  "text-7xl leading-[0.85] font-[650] tracking-[-0.05em] tabular-nums",
                  found ? "text-primary" : "text-foreground",
                )}
              >
                {report.verifiedPages}
              </strong>
              <span className="text-lg leading-snug font-medium">
                {report.verifiedPages === 1 ? "page" : "pages"} changed
                <br />
                what they charge
              </span>
            </p>
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            {report.pairedPages === 0
              ? "No page has captures in both weeks yet."
              : comparable
                ? `${Math.round((report.verifiedPages / report.pairedPages) * 100)}% of ${report.pairedPages} pages captured in both weeks`
                : report.uncertainPages > 0
                  ? "A rate is withheld while comparisons remain unresolved"
                  : `Out of ${report.pairedPages} pages captured in both weeks; a rate needs ${minimum}`}
          </p>
        </div>
        <WeekPair report={report} />
      </section>
      {report.pairedPages === 0 ? (
        <div className="mt-8 grid gap-2 border border-dashed border-gray-6 px-5 py-6 text-sm">
          <p className="font-medium">The record is still filling in.</p>
          <p className="max-w-[62ch] text-muted-foreground">
            A change needs a capture of the same page in both weeks.{" "}
            {report.newPages
              ? `${report.newPages} ${report.newPages === 1 ? "page was" : "pages were"} captured for the first time last week; their changes show from next week.`
              : "Pages captured this week are compared next week."}
          </p>
          <p>
            <Link to="/" search={{}}>
              Browse the pages in the index
            </Link>
          </p>
        </div>
      ) : groups.length === 0 ? (
        <p className="mt-8 border border-dashed border-gray-6 px-5 py-6 text-sm text-muted-foreground">
          No verified changes this week. Every paired page kept its plans, prices and listed
          features.
        </p>
      ) : (
        <ol className="grid gap-4 pt-8">
          {groups.map((group) => (
            <li key={group.pageId} className="border border-gray-5 bg-gray-2/40">
              <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-5 px-5 py-3">
                <Monogram domain={group.slug} />
                <Link
                  className="text-[0.9375rem] font-semibold hover:underline"
                  to="/pages/$slug"
                  params={{ slug: group.slug }}
                  search={{ cohort }}
                >
                  {group.slug}
                </Link>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {group.items.length} {group.items.length === 1 ? "change" : "changes"}
                </span>
                <span className="kicker ml-auto text-muted-foreground">
                  {formatDay(group.items[0]!.beforeCapturedAt)} →{" "}
                  {formatDay(group.items[0]!.afterCapturedAt)}
                </span>
              </header>
              <ol>
                {group.items.map((item) => (
                  <li key={item.key} className="border-b border-gray-4 px-5 py-3.5 last:border-b-0">
                    <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="text-sm">{item.label}</span>
                      <span
                        className={cn(
                          "kicker",
                          item.kind === "commercial" ? "text-brand-11" : "text-muted-foreground",
                        )}
                      >
                        {item.kind === "commercial" ? "Price" : "Disclosure"}
                      </span>
                    </p>
                    <p className="mt-1 flex flex-wrap items-baseline gap-2 font-mono text-sm tabular-nums">
                      <span className="text-muted-foreground line-through decoration-gray-8">
                        {item.beforeLabel}
                      </span>
                      <span className="text-gray-8" aria-hidden="true">
                        →
                      </span>
                      <strong className="font-medium text-foreground">{item.afterLabel}</strong>
                    </p>
                    <Disclosure summary="Text before and after" className="mt-2">
                      <div className="grid gap-5 sm:grid-cols-2">
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
                    </Disclosure>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

/** The two weeks side by side: how many pages each captured, and what the pairing made of them. */
function WeekPair({ report }: { report: Report }) {
  const shared = report.pairedPages + report.incompatiblePages;
  const weeks = [
    {
      label: "Week before",
      start: report.previousPeriodStart,
      end: report.periodStart,
      pages: shared + report.missingPages,
    },
    {
      label: "Last week",
      start: report.periodStart,
      end: report.periodEnd,
      pages: shared + report.newPages,
    },
  ];
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        {weeks.map((week, index) => (
          <Fragment key={week.label}>
            {index === 1 ? (
              <span className="text-gray-8" aria-hidden="true">
                →
              </span>
            ) : null}
            <div className="border border-gray-5 bg-gray-2/40 px-4 py-3">
              <p className="kicker text-muted-foreground">{week.label}</p>
              <p className="mt-1 font-mono text-xs text-gray-11">
                {formatDay(week.start)} – {formatDay(lastDay(week.end))}
              </p>
              <p className="mt-2 text-2xl leading-none font-[650] tabular-nums">
                {week.pages}
                <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                  {week.pages === 1 ? "page" : "pages"}
                </span>
              </p>
            </div>
          </Fragment>
        ))}
      </div>
      <p className="font-mono text-2xs text-muted-foreground tabular-nums">
        {report.pairedPages} in both weeks · {report.reviewedPages} reviewed · {report.newPages} new
        · {report.missingPages} missing · {report.incompatiblePages} read differently
      </p>
    </div>
  );
}

function groupByPage(items: Change[]) {
  const groups = new Map<string, { pageId: string; slug: string; items: Change[] }>();
  for (const item of items) {
    const group = groups.get(item.pageId);
    if (group) group.items.push(item);
    else groups.set(item.pageId, { pageId: item.pageId, slug: item.slug, items: [item] });
  }
  return [...groups.values()].sort((left, right) => right.items.length - left.items.length);
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
    <div className="grid content-start gap-2.5">
      <a
        className="kicker w-fit text-muted-foreground hover:text-foreground"
        href={href}
        target="_blank"
        rel="noreferrer"
      >
        {label} · {formatDay(capturedAt)} ↗
      </a>
      <Evidence>{text || "Not listed"}</Evidence>
    </div>
  );
}
