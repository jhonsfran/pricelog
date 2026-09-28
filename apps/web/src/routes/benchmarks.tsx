import { AI_APPLICATIONS_COHORT, COHORT_MINIMUM } from "@pricelog/api/benchmark";
import {
  CHARGING_SIGNAL_KEYS,
  JEV_CHOICE_RULES,
  PRICING_CHOICE_CATALOG,
  TAG_PROBABILITY_THRESHOLD,
  getPricingSignalMetadata,
  pricingSignalCoverage,
} from "@pricelog/api/pricing-intelligence";
import type { AppRouterClient } from "@pricelog/api/routers/index";
import { Skeleton } from "@pricelog/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChipRow, chipClass, segmentClass, segmentGroup } from "@/components/chips";
import { NumericBenchmarkPanel } from "@/components/numeric-prices";
import { Lede, Notice, PageHeader, PageShell } from "@/components/page";
import type { StackPage } from "@/components/page-stack";
import { PracticeChart, type ChartRow } from "@/components/practice-chart";
import { RelativeTime } from "@/components/relative-time";
import {
  CATEGORY_OPTIONS,
  parseComparisonSearch,
  type ComparisonTopic,
} from "@/lib/comparison-search";
import type { DirectoryFilter } from "@/lib/directory-filter";
import { formatToken } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/benchmarks")({
  component: BenchmarksPage,
  validateSearch: parseComparisonSearch,
});

type Benchmarks = Awaited<ReturnType<AppRouterClient["directory"]["benchmarks"]>>;
type Example = Benchmarks["examples"][number];

const MONETIZATION_KEYS = ["limit_behavior", "spend_cap", "metered_unit"] as const;
const TOPICS: { value: ComparisonTopic; label: string }[] = [
  { value: "charging_structure", label: "How they charge" },
  { value: "monetization", label: "How they monetize" },
  { value: "prices", label: "Published prices" },
];

const asStack = (examples: Example[]): StackPage[] =>
  examples.map((page) => ({ slug: page.slug, domain: page.normalizedDomain }));

function BenchmarksPage() {
  const { cohort = AI_APPLICATIONS_COHORT, topic = "charging_structure" } = Route.useSearch();
  const benchmarks = useQuery(orpc.directory.benchmarks.queryOptions({ input: { cohort } }));
  const data = benchmarks.data;
  const selected = data?.selected;
  const comparable = (selected?.pageCount ?? 0) >= COHORT_MINIMUM;
  const examples = data?.examples ?? [];
  const share = (count: number) =>
    comparable && selected?.pageCount
      ? `${Math.round((count / selected.pageCount) * 100)}%`
      : `${count}`;

  return (
    <PageShell>
      <PageHeader eyebrow="Pricing practices" title="Compare how AI products charge">
        <Lede>
          Pick a category and a question. Every answer opens the pages behind it, each with its
          dated source.
        </Lede>
      </PageHeader>
      <ChipRow label="Product category">
        {CATEGORY_OPTIONS.map((option) => {
          const count = data?.available.find((item) => item.cohort === option.value)?.pageCount;
          return (
            <Link
              key={option.value}
              to="/benchmarks"
              search={(previous) => ({ ...previous, cohort: option.value })}
              resetScroll={false}
              aria-current={option.value === cohort ? "true" : undefined}
              className={chipClass(option.value === cohort, data !== undefined && !count)}
            >
              {option.label}
              {data ? (
                <span className="font-mono text-2xs opacity-70 tabular-nums">{count ?? 0}</span>
              ) : null}
            </Link>
          );
        })}
      </ChipRow>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-gray-5 pb-4">
        <nav aria-label="Pricing question" className={segmentGroup}>
          {TOPICS.map((option) => (
            <Link
              key={option.value}
              to="/benchmarks"
              search={(previous) => ({ ...previous, topic: option.value })}
              resetScroll={false}
              aria-current={option.value === topic ? "true" : undefined}
              className={segmentClass(option.value === topic)}
            >
              {option.label}
            </Link>
          ))}
        </nav>
        {data ? (
          <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 font-mono text-xs text-muted-foreground tabular-nums [&>*+*]:before:mr-2.5 [&>*+*]:before:text-gray-8 [&>*+*]:before:inline-block [&>*+*]:before:content-['·']">
            <span>
              <strong className="font-medium text-foreground">{selected?.pageCount ?? 0}</strong>{" "}
              pages here
            </span>
            <span>
              {data.coverage.eligible} of {data.coverage.total} current
            </span>
            {data.coverage.pending ? <span>{data.coverage.pending} pending</span> : null}
            {data.computedAt ? (
              <span>
                computed <RelativeTime value={data.computedAt} />
              </span>
            ) : null}
            <Link to="/methodology" search={{ cohort }}>
              How this is measured
            </Link>
          </p>
        ) : null}
      </div>
      {selected && !comparable && topic !== "prices" ? (
        <p className="mt-4 text-xs text-warning-11">
          Fewer than {COHORT_MINIMUM} pages in this category, so counts stand in for percentages.
        </p>
      ) : null}
      {benchmarks.isLoading ? (
        <div className="grid gap-4 pt-6" aria-hidden="true">
          <Skeleton className="h-72" />
        </div>
      ) : benchmarks.isError ? (
        <Notice>Pricing practices are not available.</Notice>
      ) : !selected ? (
        <p className="mt-6 border border-dashed border-gray-6 px-5 py-6 text-sm text-muted-foreground">
          No current captures in this category yet.{" "}
          <Link to="/dashboard">Track a pricing page</Link> to start collecting it.
        </p>
      ) : topic === "charging_structure" ? (
        <div className="pt-6">
          <PracticeChart
            title="How these products charge"
            question="Pages that state each kind of charge. A page can state several."
            total={comparable ? undefined : selected.pageCount}
            rows={CHARGING_SIGNAL_KEYS.map((key): ChartRow => {
              const metadata = getPricingSignalMetadata(key)!;
              const coverage = pricingSignalCoverage(
                selected.pageCount,
                selected.signalShares[key],
              );
              return {
                key,
                label: metadata.label,
                fill: coverage.fraction,
                display: share(coverage.stated),
                count: coverage.stated,
                pages: asStack(
                  examples.filter(
                    (page) =>
                      (page.signals.find((signal) => signal.key === key)?.probability ?? 0) >=
                      TAG_PROBABILITY_THRESHOLD,
                  ),
                ),
                filter: { signal: key, cohort } satisfies DirectoryFilter,
              };
            })}
            footnote={`Out of ${selected.pageCount} current pages. Select an answer to see its pages.`}
          />
        </div>
      ) : topic === "monetization" ? (
        <div className="grid gap-4 pt-6">
          {MONETIZATION_KEYS.map((key) => {
            const answers = selected.choiceShares[key] ?? { answered: 0, options: {} };
            return (
              <PracticeChart
                key={key}
                title={PRICING_CHOICE_CATALOG[key].label}
                question={PRICING_CHOICE_CATALOG[key].question.replace(/ Choose \w+ when.*$/, "")}
                total={comparable ? undefined : selected.pageCount}
                rows={Object.entries(answers.options)
                  .filter(([option]) => !JEV_CHOICE_RULES[key].absent.includes(option))
                  .map(([option, count]): ChartRow => ({
                    key: option,
                    label: formatToken(option),
                    fill: selected.pageCount ? count / selected.pageCount : 0,
                    display: share(count),
                    count,
                    pages: asStack(
                      examples.filter(
                        (page) =>
                          page.choices.find((choice) => choice.key === key)?.choice === option,
                      ),
                    ),
                    filter: { choiceKey: key, choiceValue: option, cohort },
                  }))}
                footnote={`Out of ${selected.pageCount} current pages. ${selected.pageCount - answers.answered} do not say.`}
              />
            );
          })}
        </div>
      ) : (
        <NumericBenchmarkPanel
          prices={selected.numericPrices}
          category={cohort.startsWith("category:")}
          examples={data?.priceExamples ?? []}
          pageCount={selected.pageCount}
          cohort={cohort}
        />
      )}
    </PageShell>
  );
}
