import { EXPECTED_JEV_MODEL, MAX_CAPTURE_AGE_MS } from "@pricelog/api/pricing-facts";
import { PRICING_INTELLIGENCE_RUBRIC_ID } from "@pricelog/api/pricing-intelligence";
import { buttonVariants } from "@pricelog/ui/components/button";
import { Skeleton } from "@pricelog/ui/components/skeleton";
import { cn } from "@pricelog/ui/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AtAGlance } from "@/components/at-a-glance";
import { CaptureFrame } from "@/components/capture-frame";
import { NumericPricesPanel } from "@/components/numeric-prices";
import { BackLink, Notice, PageShell, StatePage } from "@/components/page";
import { PlanGrid, SharedPrices } from "@/components/plan-grid";
import { RecordHeader } from "@/components/record-header";
import { VersionChanges, changedPlans } from "@/components/version-changes";
import { VersionRail } from "@/components/version-rail";
import { parsePageSearch } from "@/lib/directory-filter";
import { formatDay, toDate } from "@/lib/time";
import { serverUrl } from "@/lib/url";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/pages/$slug")({
  component: PublicPageProfile,
  validateSearch: parsePageSearch,
});

function PublicPageProfile() {
  const { slug } = Route.useParams();
  const { v, ...filter } = Route.useSearch();
  const page = useQuery(orpc.directory.getBySlug.queryOptions({ input: { slug } }));
  const latest = page.data?.versions[0]?.runId ?? page.data?.runId;
  const runId = v ?? latest;
  const version = useQuery(
    orpc.directory.version.queryOptions({
      input: { slug, runId: runId ?? "" },
      enabled: Boolean(runId),
      // The page keeps the version on screen while the next one loads, so switching never blanks it.
      placeholderData: keepPreviousData,
    }),
  );
  if (page.isLoading) return <StatePage loading text="Loading page record…" />;
  if (!page.data) return <StatePage text="This pricing page is not in the public index." />;
  const item = page.data;
  const category = item.choices.find((choice) => choice.key === "product_category")?.choice;
  const cohort = filter.cohort ?? (category ? `category:${category}` : undefined);
  const shown = version.data;
  const viewingLatest = !v || v === latest;

  return (
    <PageShell>
      <BackLink to="/" search={filter}>
        Directory
      </BackLink>
      <RecordHeader
        domain={item.normalizedDomain}
        category={category}
        url={item.canonicalUrl}
        description={item.description}
        actions={
          <Link
            to="/benchmarks"
            search={{ cohort }}
            className={buttonVariants({ variant: "outline" })}
          >
            Compare category
          </Link>
        }
      />
      <div className="border-y border-gray-5 py-2.5">
        <VersionRail
          slug={slug}
          filter={filter}
          versions={item.versions}
          selected={shown?.runId ?? runId ?? ""}
        />
      </div>
      {!shown ? (
        version.isLoading || !runId ? (
          <VersionSkeleton />
        ) : (
          <Notice>This version of the page is not available.</Notice>
        )
      ) : (
        <div
          className={cn(
            "transition-opacity duration-200",
            version.isPlaceholderData && "opacity-50",
          )}
        >
          {!viewingLatest ? (
            <p className="mt-5 flex flex-wrap items-center justify-between gap-3 border border-gray-5 bg-gray-2 px-4 py-2.5 text-sm">
              <span>
                You are viewing the capture of{" "}
                <strong className="font-medium">{formatDay(shown.capturedAt)}</strong>.
              </span>
              <Link to="/pages/$slug" params={{ slug }} search={filter} resetScroll={false}>
                Go to the latest version
              </Link>
            </p>
          ) : excludedFromComparisons(shown) ? (
            <p className="mt-5 border border-warning-6 bg-warning-2 px-4 py-2.5 text-sm text-warning-11">
              Not in current comparisons: this capture is more than 14 days old or was read by an
              earlier method.
            </p>
          ) : null}
          <div className="grid gap-8 pt-7 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,1fr)]">
            <div className="mt-2.5 mr-2.5 min-w-0">
              <CaptureFrame
                key={shown.runId}
                src={serverUrl(shown.screenshotUrl)}
                url={shown.finalUrl}
                capturedAt={shown.capturedAt}
                domain={item.normalizedDomain}
              />
            </div>
            <aside className="grid content-start gap-4">
              <AtAGlance
                snapshot={shown.snapshot}
                choices={shown.choices}
                signals={shown.signals}
              />
              <VersionChanges previous={shown.previous} changes={shown.changes} />
            </aside>
          </div>
          {shown.snapshot?.status === "collected" ? (
            <>
              <PlanGrid
                key={shown.runId}
                snapshot={shown.snapshot}
                changedPlans={changedPlans(shown.changes)}
              />
              <SharedPrices prices={shown.snapshot.shared_prices ?? []} />
            </>
          ) : shown.snapshot?.reason ? (
            <Notice className="mt-10 border-t">{shown.snapshot.reason}</Notice>
          ) : shown.numericPrices ? (
            <NumericPricesPanel prices={shown.numericPrices} sourceUrl={shown.sourceUrl} />
          ) : (
            <Notice className="mt-10 border-t">No plans were read from this capture.</Notice>
          )}
          <footer className="mt-14 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-t border-gray-4 pt-4 text-xs text-muted-foreground">
            <p className="max-w-[70ch]">
              This record describes terms found on the captured page. Missing disclosure does not
              establish that a product lacks a feature.
            </p>
            <a href={serverUrl(shown.sourceUrl)} target="_blank" rel="noreferrer">
              Read the archived text
            </a>
          </footer>
        </div>
      )}
    </PageShell>
  );
}

/** Current comparisons need the current rubric and model and a capture from the last 14 days. */
function excludedFromComparisons(version: { rubricId: string; model: string; capturedAt: number }) {
  const age = Date.now() - toDate(version.capturedAt).getTime();
  return (
    version.rubricId !== PRICING_INTELLIGENCE_RUBRIC_ID ||
    version.model !== EXPECTED_JEV_MODEL ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > MAX_CAPTURE_AGE_MS
  );
}

/** Holds the record's layout while a version loads, so nothing jumps when it lands. */
function VersionSkeleton() {
  return (
    <div
      className="grid gap-8 pt-7 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,1fr)]"
      aria-hidden="true"
    >
      <Skeleton className="h-[32rem]" />
      <div className="grid content-start gap-4">
        <Skeleton className="h-64" />
        <Skeleton className="h-28" />
      </div>
    </div>
  );
}
