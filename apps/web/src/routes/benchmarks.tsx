import { LayerTitle } from "@/components/layer-title";
import { AI_APPLICATIONS_COHORT, COHORT_MINIMUM } from "@my-better-t-app/api/benchmark";
import {
  CHARGING_SIGNAL_KEYS,
  PRACTICE_CHOICE_KEYS,
  getPricingChoiceMetadata,
  getPricingSignalMetadata,
  pricingPolicyCoverage,
  pricingSignalCoverage,
} from "@my-better-t-app/api/pricing-intelligence";
import { Spinner } from "@my-better-t-app/ui/components/spinner";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { CategoryPicker } from "@/components/category-picker";
import { formatToken } from "@/components/intelligence-profile";
import { SelectField } from "@/components/select-field";
import { NumericBenchmarkPanel } from "@/components/numeric-prices";
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
    <main className="directory-shell benchmark-shell">
      <section className="benchmark-hero">
        <div>
          <p className="eyebrow">Pricing practices</p>
          <h1>
            <LayerTitle>Compare how AI products charge</LayerTitle>
          </h1>
        </div>
        <p className="hero-copy">
          Choose a category and a pricing question. Inspect the published terms and the pages behind
          each answer.
        </p>
      </section>
      <div className="comparison-controls">
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
        <p className="chart-footnote">
          {data.coverage.eligible} of {data.coverage.total} registered pages eligible ·{" "}
          {data.coverage.stale} outside the capture window · {data.coverage.incompatible} need a new
          analysis · {data.coverage.pending} pending. Eligible captures are from the past 14 days.
        </p>
      ) : null}
      {benchmarks.isLoading ? (
        <div className="directory-message" role="status">
          <Spinner />
          Reading pricing practices…
        </div>
      ) : benchmarks.isError ? (
        <p className="directory-message">Pricing practices are not available.</p>
      ) : !selected ? (
        <p className="directory-message">
          No current observations in this category. Add a pricing page to start collecting it.
        </p>
      ) : (
        <>
          {/* One line of provenance. The caveats that used to sit here in
              full are on the methodology page, one click away. */}
          <p className="cohort-summary">
            <strong>{selected.pageCount} pages</strong>
            <span>
              {data?.computedAt ? (
                <>
                  computed <RelativeTime value={data.computedAt} />
                </>
              ) : (
                "from the latest successful captures"
              )}
            </span>
            <Link to="/methodology" search={{ cohort }}>
              How this is measured
            </Link>
          </p>
          {selected.pageCount < minimum && topic !== "prices" ? (
            <p className="chart-footnote">
              Fewer than {minimum} pages in this category, so counts are shown in place of
              percentages.
            </p>
          ) : null}
          {topic === "charging_structure" ? (
            <section className="benchmark-section">
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
                    <div className="definition" key={key}>
                      <h4>{metadata.label}</h4>
                      <p className="definition-counts">
                        {selected.signalShares[key]?.stated ?? 0} stated ·{" "}
                        {selected.signalShares[key]?.notEstablished ?? 0} not established ·{" "}
                        {selected.signalShares[key]?.uncertain ?? selected.pageCount} uncertain
                      </p>
                      <p className="chart-question">{metadata.question}</p>
                      <p>Stated: {metadata.whenTrue}</p>
                      <p>Not established: {metadata.whenFalse}</p>
                    </div>
                  );
                })}
              </PracticeChart>
            </section>
          ) : null}
          {PRACTICE_CHOICE_KEYS.some((key) => key === topic) ? (
            <section className="benchmark-section">
              <div className="chart-column">
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
                      <dl className="definition-list">
                        {Object.entries(metadata.options).map(([option, description]) => (
                          <div key={option}>
                            <dt>{formatToken(option)}</dt>
                            <dd>{description}</dd>
                          </div>
                        ))}
                      </dl>
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
    </main>
  );
}
