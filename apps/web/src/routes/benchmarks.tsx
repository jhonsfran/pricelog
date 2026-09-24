import { AI_APPLICATIONS_COHORT, COHORT_MINIMUM } from "@my-better-t-app/api/benchmark";
import {
  CHARGING_SIGNAL_KEYS,
  PRACTICE_CHOICE_KEYS,
  getPricingChoiceMetadata,
  getPricingSignalMetadata,
  pricingPolicyCoverage,
  pricingSignalCoverage,
} from "@my-better-t-app/api/pricing-intelligence";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { CategoryPicker } from "@/components/category-picker";
import { formatToken } from "@/components/intelligence-profile";
import { SelectField } from "@/components/select-field";
import { NumericBenchmarkPanel } from "@/components/numeric-prices";
import { Definitions, Lede, Notice, PageHeader, PageShell, StatRow } from "@/components/page";
import { PracticeChart, type ChartRow } from "@/components/practice-chart";
import { RelativeTime } from "@/components/relative-time";
import type { DirectoryFilter } from "@/lib/directory-filter";
import { parseComparisonSearch, type ComparisonTopic } from "@/lib/comparison-search";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/benchmarks")({
  component: BenchmarksPage,
  validateSearch: parseComparisonSearch,
});
const topicOptions = [
  { value: "charging_structure", label: "How products charge" },
  ...PRACTICE_CHOICE_KEYS.map((key) => ({
    value: key,
    label: getPricingChoiceMetadata(key)!.label,
  })),
  { value: "prices", label: "Published prices" },
];

function BenchmarksPage() {
  const { cohort = AI_APPLICATIONS_COHORT, topic = "charging_structure" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const benchmarks = useQuery(orpc.directory.benchmarks.queryOptions({ input: { cohort } }));
  const data = benchmarks.data;
  const selected = data?.selected;
  const minimum = COHORT_MINIMUM;
  // A bar links out carrying the cohort it was measured over, so the
  // directory resolves the same population and the two counts agree.
  return (
    <PageShell>
      <PageHeader
        eyebrow="Pricing practices"
        title="Compare how AI products charge"
        aside={
          <Lede>
            Choose a category and a pricing question. Inspect the published terms and the pages
            behind each answer.
          </Lede>
        }
      />
      <div className="grid gap-5 py-6 md:grid-cols-2">
        <CategoryPicker
          value={cohort}
          counts={data?.available}
          onChange={(value) =>
            navigate({ search: (previous) => ({ ...previous, cohort: value }), resetScroll: false })
          }
        />
        <SelectField
          id="pricing-question"
          label="Pricing question"
          value={topic}
          options={topicOptions}
          onChange={(value) =>
            navigate({
              search: (previous) => ({ ...previous, topic: value as ComparisonTopic }),
              resetScroll: false,
            })
          }
        />
      </div>
      {data ? (
        <section aria-label="Sample coverage">
          <StatRow
            items={[
              {
                label: "Eligible pages",
                value: (
                  <>
                    {data.coverage.eligible}
                    <span className="text-base text-muted-foreground">
                      {" "}
                      / {data.coverage.total}
                    </span>
                  </>
                ),
              },
              { label: "Outside capture window", value: data.coverage.stale },
              { label: "Need a new analysis", value: data.coverage.incompatible },
              { label: "Pending", value: data.coverage.pending },
            ]}
          />
          <p className="mt-2.5 text-xs text-muted-foreground">
            Eligible captures are from the past 14 days.
          </p>
        </section>
      ) : null}
      {benchmarks.isLoading ? (
        <Notice loading>Reading pricing practices…</Notice>
      ) : benchmarks.isError ? (
        <Notice>Pricing practices are not available.</Notice>
      ) : !selected ? (
        <Notice>
          No current observations in this category. Add a pricing page to start collecting it.
        </Notice>
      ) : (
        <>
          {/* One line of provenance. The caveats that used to sit here in
              full are on the methodology page, one click away. */}
          <p className="mt-6 flex flex-wrap items-baseline gap-x-4.5 gap-y-2 border-t border-gray-4 pt-3.5 font-mono text-xs text-muted-foreground">
            <strong className="font-medium text-foreground tabular-nums">
              {selected.pageCount} pages
            </strong>
            <span>
              {data?.computedAt ? (
                <>
                  computed <RelativeTime value={data.computedAt} />
                </>
              ) : (
                "from the latest successful captures"
              )}
            </span>
            <span className="md:ml-auto">
              <Link to="/methodology" search={{ cohort }}>
                How this is measured
              </Link>
            </span>
          </p>
          {selected.pageCount < minimum && topic !== "prices" ? (
            <p className="mt-3 text-xs text-warning-11">
              Fewer than {minimum} pages in this category, so counts are shown in place of
              percentages.
            </p>
          ) : null}
          {topic === "charging_structure" ? (
            <section className="pt-6">
              <PracticeChart
                title="How these products charge"
                question="Share of all eligible pages in this category that state each charge. A page can state several."
                rows={CHARGING_SIGNAL_KEYS.map((key): ChartRow => {
                  const metadata = getPricingSignalMetadata(key)!;
                  const share = pricingSignalCoverage(
                    selected.pageCount,
                    selected.signalShares[key],
                  );
                  const comparable = selected.pageCount >= minimum;
                  return {
                    key,
                    label: `${metadata.label} · ${share.uncertain} uncertain`,
                    fill: share.fraction,
                    display: comparable
                      ? `${Math.round(share.fraction * 100)}%`
                      : `${share.stated}`,
                    filter: { signal: key, cohort } satisfies DirectoryFilter,
                  };
                })}
                footnote={`Denominator: all ${selected.pageCount} eligible pages in this category, including uncertain observations. Select a bar to list the pages that state the charge.`}
              >
                {CHARGING_SIGNAL_KEYS.map((key) => {
                  const metadata = getPricingSignalMetadata(key)!;
                  return (
                    <div className="grid gap-1.5" key={key}>
                      <h4 className="text-sm">{metadata.label}</h4>
                      <p className="font-mono text-2xs text-muted-foreground tabular-nums">
                        {selected.signalShares[key]?.stated ?? 0} stated ·{" "}
                        {selected.signalShares[key]?.notEstablished ?? 0} not established ·{" "}
                        {selected.signalShares[key]?.uncertain ?? selected.pageCount} uncertain
                      </p>
                      <p>{metadata.question}</p>
                      <p className="text-muted-foreground">Stated: {metadata.whenTrue}</p>
                      <p className="text-muted-foreground">Not established: {metadata.whenFalse}</p>
                    </div>
                  );
                })}
              </PracticeChart>
            </section>
          ) : null}
          {PRACTICE_CHOICE_KEYS.some((key) => key === topic) ? (
            <section className="pt-6">
              <div className="grid gap-1">
                {PRACTICE_CHOICE_KEYS.filter((key) => key === topic).map((key) => {
                  const metadata = getPricingChoiceMetadata(key)!;
                  const share = selected.choiceShares[key];
                  const coverage = pricingPolicyCoverage(selected.pageCount, share);
                  const comparable = selected.pageCount >= minimum;
                  const rows = Object.entries(share?.options ?? {})
                    .filter(([option]) => option !== "not_applicable" && option !== "unknown")
                    .map(([option, count]): ChartRow => ({
                      key: option,
                      label: formatToken(option),
                      fill: selected.pageCount > 0 ? count / selected.pageCount : 0,
                      display: comparable
                        ? `${Math.round((count / selected.pageCount) * 100)}%`
                        : `${count}`,
                      filter: {
                        choiceKey: key,
                        choiceValue: option,
                        cohort,
                      } satisfies DirectoryFilter,
                    }));
                  return (
                    <PracticeChart
                      key={key}
                      title={metadata.label}
                      question={metadata.question}
                      rows={rows}
                      footnote={`Denominator: all ${selected.pageCount} eligible pages. ${coverage.disclosed} disclose a policy · ${coverage.notDisclosed} do not disclose it · ${coverage.notApplicable} explicitly not applicable · ${coverage.uncertain} uncertain. Nondisclosure does not establish applicability.`}
                    >
                      <Definitions
                        items={Object.entries(metadata.options).map(([option, description]) => ({
                          key: option,
                          term: formatToken(option),
                          detail: description,
                        }))}
                      />
                    </PracticeChart>
                  );
                })}
              </div>
            </section>
          ) : null}
          {topic === "prices" ? (
            <NumericBenchmarkPanel
              prices={selected.numericPrices}
              category={cohort.startsWith("category:")}
              examples={data?.priceExamples ?? []}
              pageCount={selected.pageCount}
              cohort={cohort}
            />
          ) : null}
        </>
      )}
    </PageShell>
  );
}
