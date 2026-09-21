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
import { ShareBars } from "@/components/distribution-chart";
import { formatToken } from "@/components/intelligence-profile";
import { WeeklyChangesReport } from "@/components/weekly-changes-report";
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
          <p className="eyebrow">THE AI PRICING INDEX</p>
          <h1>HOW AI PRODUCTS CHARGE</h1>
        </div>
        <p className="hero-copy">
          Compare published charging methods and policies before you launch or change paid AI usage.
          Each observation describes one captured pricing page.
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
      <p className="benchmark-meta">
        {cohort === AI_APPLICATIONS_COHORT
          ? "AI applications covers eight task categories. Model APIs are separate. "
          : "Category membership describes the stated product purpose. "}
        <Link to="/methodology">Questions and methodology</Link>
      </p>
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
          <p className="benchmark-meta">
            {selected.pageCount} pricing pages.{" "}
            {data?.computedAt
              ? `Computed ${formatDate(data.computedAt)}.`
              : "Computed from the latest successful captures."}{" "}
            {data?.totalIndexedPages !== data?.indexedPages
              ? `${data?.indexedPages} of ${data?.totalIndexedPages} indexed pages use the current rubric.`
              : ""}
          </p>
          {selected.pageCount < minimum ? (
            <p className="benchmark-meta">
              This category has fewer than {minimum} pages. Counts and observed pages remain
              visible; percentages are withheld.
            </p>
          ) : null}
          <section className="benchmark-section">
            <div className="section-kicker">
              <span>CHARGING STRUCTURE</span>
              <span>COMPONENTS CAN OVERLAP</span>
            </div>
            <p className="benchmark-meta">
              A low disclosure probability means the page does not establish a charge. It does not
              prove that the product lacks it.
            </p>
            <div className="finding-grid">
              {CHARGING_SIGNAL_KEYS.map((key) => {
                const metadata = getPricingSignalMetadata(key)!;
                const share = selected.signalShares[key] ?? {
                  stated: 0,
                  notEstablished: 0,
                  uncertain: selected.pageCount,
                };
                const classified = share.stated + share.notEstablished;
                return (
                  <article className="finding-card" key={key}>
                    <strong>
                      {classified >= minimum && selected.pageCount >= minimum
                        ? `${Math.round((share.stated / classified) * 100)}%`
                        : share.stated}
                    </strong>
                    <span>{metadata.label}</span>
                    <small>
                      {share.stated} stated · {share.notEstablished} not established ·{" "}
                      {share.uncertain} uncertain
                    </small>
                    <p className="dist-question">{metadata.question}</p>
                    <small>
                      {classified} classified of {selected.pageCount} pages.{" "}
                      {classified < minimum
                        ? `Percentages need ${minimum} classified pages.`
                        : "Percentage uses classified pages."}
                    </small>
                    <details>
                      <summary>Definitions and source examples</summary>
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
                    </details>
                  </article>
                );
              })}
            </div>
          </section>
          <section className="benchmark-section">
            <div className="section-kicker">
              <span>COMMERCIAL TERMS</span>
            </div>
            <p className="benchmark-meta">
              Not disclosed remains in the comparison. Not applicable is excluded. Uncertain answers
              remain separate.
            </p>
            <div className="share-grid">
              {PRACTICE_CHOICE_KEYS.map((key) => {
                const metadata = getPricingChoiceMetadata(key)!;
                const share = selected.choiceShares[key];
                const coverage = pricingPolicyCoverage(selected.pageCount, share);
                const items = Object.entries(share?.options ?? {})
                  .filter(([option]) => option !== "not_applicable")
                  .map(([option, count]) => ({ key: option, label: formatToken(option), count }));
                return (
                  <div key={key}>
                    <ShareBars
                      title={metadata.label}
                      question={metadata.question}
                      answered={coverage.applicable}
                      minimum={minimum}
                      items={items}
                    />
                    <p className="benchmark-meta">
                      {selected.pageCount} pages · {coverage.classified} classified ·{" "}
                      {coverage.uncertain} uncertain · {coverage.notApplicable} not applicable ·{" "}
                      {coverage.notDisclosed} not disclosed
                    </p>
                    <details className="metric-definitions">
                      <summary>Answer definitions and source examples</summary>
                      <dl>
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
                    </details>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="benchmark-section">
            <div className="section-kicker">
              <span>OBSERVED PAGES</span>
            </div>
            <p className="benchmark-meta">Up to 12 captured source examples from this category.</p>
            <SourceExamples examples={examples} />
          </section>
        </>
      )}
      <WeeklyChangesReport cohort={cohort} minimum={minimum} />
      <section className="methodology-note">
        <h2>Price statistics are deferred</h2>
        <p>
          Exact prices need a validated collection method. This release compares published charging
          rules and policies without estimating numeric prices.
        </p>
        <p>
          Pricelog is by{" "}
          <a href="https://unprice.dev" target="_blank" rel="noreferrer">
            Unprice
          </a>
          . For implementation, see{" "}
          <a href="https://docs.unprice.dev" target="_blank" rel="noreferrer">
            Unprice documentation
          </a>{" "}
          for usage billing and customer budgets.
        </p>
      </section>
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
    return <p className="benchmark-meta">No source examples for this observation yet.</p>;
  return (
    <ul className="source-examples">
      {examples.map((page) => (
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
          <small>Captured {formatDate(page.scannedAt)}</small>
        </li>
      ))}
    </ul>
  );
}
function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(value),
  );
}
