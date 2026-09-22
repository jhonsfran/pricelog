import { AI_APPLICATIONS_COHORT, COHORT_MINIMUM } from "@my-better-t-app/api/benchmark";
import {
  CHARGING_SIGNAL_KEYS,
  PRACTICE_CHOICE_KEYS,
  AI_APPLICATION_CATEGORY_OPTIONS,
  getPricingChoiceMetadata,
  getPricingSignalMetadata,
  pricingPolicyCoverage,
  TAG_PROBABILITY_THRESHOLD,
} from "@my-better-t-app/api/pricing-intelligence";
import { Spinner } from "@my-better-t-app/ui/components/spinner";
import { ToggleGroup, ToggleGroupItem } from "@my-better-t-app/ui/components/toggle-group";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { formatToken } from "@/components/intelligence-profile";
import { LayerTitle } from "@/components/layer-title";
import { NumericBenchmarkPanel } from "@/components/numeric-prices";
import { PracticeChart, type ChartRow } from "@/components/practice-chart";
import { RelativeTime } from "@/components/relative-time";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/benchmarks")({ component: BenchmarksPage });
const categories = Object.keys(AI_APPLICATION_CATEGORY_OPTIONS);

function BenchmarksPage() {
  const [cohort, setCohort] = useState(AI_APPLICATIONS_COHORT);
  const benchmarks = useQuery(orpc.directory.benchmarks.queryOptions({ input: { cohort } }));
  const data = benchmarks.data;
  const selected = data?.selected;
  const examples = data?.examples ?? [];
  const minimum = data?.minimumCohortSize ?? COHORT_MINIMUM;
  const options = [
    { cohort: AI_APPLICATIONS_COHORT, label: "AI applications" },
    ...categories.map((key) => ({ cohort: `category:${key}`, label: formatToken(key) })),
    { cohort: "category:model_apis", label: "Model APIs" },
  ];

  return (
    <main className="directory-shell benchmark-shell">
      <section className="benchmark-hero">
        <div>
          <p className="eyebrow">The AI pricing index</p>
          <h1>
            <LayerTitle>HOW AI PRODUCTS CHARGE</LayerTitle>
          </h1>
        </div>
        <p className="hero-copy">
          What published pricing pages actually say about charging, across one category at a time.
        </p>
      </section>
      <ToggleGroup
        className="cohort-picker"
        aria-label="Product category"
        variant="outline"
        spacing={0}
        value={[cohort]}
        onValueChange={(value) => setCohort(value[0] ?? cohort)}
      >
        {options.map((option) => (
          <ToggleGroupItem key={option.cohort} value={option.cohort}>
            {option.label}
            <small>
              {data?.available.find((item) => item.cohort === option.cohort)?.pageCount ?? 0}
            </small>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
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
            <Link to="/methodology">How this is measured</Link>
          </p>
          {selected.pageCount < minimum ? (
            <p className="chart-footnote">
              Fewer than {minimum} pages in this category, so counts are shown in place of
              percentages.
            </p>
          ) : null}
          <section className="benchmark-section">
            <div className="section-kicker">
              <span>CHARGING STRUCTURE</span>
              <span>COMPONENTS CAN OVERLAP</span>
            </div>
            <PracticeChart
              title="How these products charge"
              question="Share of classified pages that state each charge. A page can state several."
              rows={CHARGING_SIGNAL_KEYS.map((key): ChartRow => {
                const metadata = getPricingSignalMetadata(key)!;
                const share = selected.signalShares[key] ?? {
                  stated: 0,
                  notEstablished: 0,
                  uncertain: selected.pageCount,
                };
                const classified = share.stated + share.notEstablished;
                const comparable = classified >= minimum && selected.pageCount >= minimum;
                return {
                  key,
                  label: metadata.label,
                  fill: classified > 0 ? share.stated / classified : 0,
                  display: comparable
                    ? `${Math.round((share.stated / classified) * 100)}%`
                    : `${share.stated}`,
                };
              })}
              footnote={`${selected.pageCount} pages in this category. Percentages use classified pages only, and a charge that is not established describes the page rather than the product.`}
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
                    <SourceExamples
                      examples={examples.filter((page) =>
                        page.signals.some(
                          (signal) =>
                            signal.key === key && signal.probability >= TAG_PROBABILITY_THRESHOLD,
                        ),
                      )}
                    />
                  </div>
                );
              })}
            </PracticeChart>
          </section>
          <section className="benchmark-section">
            <div className="section-kicker">
              <span>COMMERCIAL TERMS</span>
              <span>{PRACTICE_CHOICE_KEYS.length} QUESTIONS</span>
            </div>
            <div className="chart-column">
              {PRACTICE_CHOICE_KEYS.map((key) => {
                const metadata = getPricingChoiceMetadata(key)!;
                const share = selected.choiceShares[key];
                const coverage = pricingPolicyCoverage(selected.pageCount, share);
                const comparable = coverage.applicable >= minimum;
                const rows = Object.entries(share?.options ?? {})
                  .filter(([option]) => option !== "not_applicable")
                  .map(([option, count]): ChartRow => ({
                    key: option,
                    label: formatToken(option),
                    fill: coverage.applicable > 0 ? count / coverage.applicable : 0,
                    display: comparable
                      ? `${Math.round((count / coverage.applicable) * 100)}%`
                      : `${count}`,
                  }));
                return (
                  <PracticeChart
                    key={key}
                    title={metadata.label}
                    question={metadata.question}
                    rows={rows}
                    footnote={`${coverage.applicable} applicable of ${selected.pageCount} pages`}
                  >
                    <p className="chart-question">
                      {coverage.classified} classified · {coverage.uncertain} uncertain ·{" "}
                      {coverage.notApplicable} not applicable · {coverage.notDisclosed} not
                      disclosed
                    </p>
                    <dl className="definition-list">
                      {Object.entries(metadata.options).map(([option, description]) => (
                        <div key={option}>
                          <dt>{formatToken(option)}</dt>
                          <dd>{description}</dd>
                        </div>
                      ))}
                    </dl>
                    <SourceExamples
                      examples={examples.filter((page) =>
                        page.choices.some((choice) => choice.key === key),
                      )}
                      questionKey={key}
                    />
                  </PracticeChart>
                );
              })}
            </div>
          </section>
          <NumericBenchmarkPanel
            prices={selected.numericPrices}
            category={cohort.startsWith("category:")}
            examples={data?.priceExamples ?? []}
            pageCount={selected.pageCount}
          />
        </>
      )}
    </main>
  );
}

type ExamplePage = {
  id: string;
  slug: string;
  displayName: string | null;
  normalizedDomain: string;
  scannedAt: Date | string;
  choices: { key: string; choice: string }[];
  signals: { key: string; probability: number }[];
};
function SourceExamples({
  examples,
  questionKey,
}: {
  examples: ExamplePage[];
  questionKey?: string;
}) {
  if (!examples.length)
    return <p className="chart-footnote">No source examples for this observation yet.</p>;
  return (
    <ul className="source-examples">
      {examples.slice(0, 8).map((page) => (
        <li key={page.id}>
          <Link to="/pages/$slug" params={{ slug: page.slug }}>
            {page.displayName ?? page.normalizedDomain}
          </Link>
          {questionKey ? (
            <span>
              {formatToken(
                page.choices.find((choice) => choice.key === questionKey)?.choice ?? "uncertain",
              )}
            </span>
          ) : null}
          <small>
            Captured <RelativeTime value={page.scannedAt} />
          </small>
        </li>
      ))}
    </ul>
  );
}
