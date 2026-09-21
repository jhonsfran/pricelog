import { AI_NATIVE_COHORT, OVERALL_SCORE_KEY } from "@my-better-t-app/api/benchmark";
import { Spinner } from "@my-better-t-app/ui/components/spinner";
import { ToggleGroup, ToggleGroupItem } from "@my-better-t-app/ui/components/toggle-group";
import {
  getPricingChoiceMetadata,
  getPricingScoreMetadata,
  getPricingSignalMetadata,
  PRICING_CHOICE_CATALOG,
  PRICING_SCORE_CATALOG,
} from "@my-better-t-app/api/pricing-intelligence";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DistributionChart, ShareBars } from "@/components/distribution-chart";
import { formatToken } from "@/components/intelligence-profile";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/benchmarks")({ component: BenchmarksPage });

/** Questions no other pricing dataset asks. */
const AI_COST_SIGNALS = ["has_spend_cap", "has_usage_visibility", "credits_expire"] as const;

/** Below this share of AI-native pages, the AI cost model is not the cohort's story. */
const AI_LEAD_THRESHOLD = 0.4;

function BenchmarksPage() {
  const [cohort, setCohort] = useState("all");
  const benchmarks = useQuery(orpc.directory.benchmarks.queryOptions({ input: { cohort } }));
  const data = benchmarks.data;
  const selected = data?.selected ?? null;

  // Show AI cost data first only when it represents the selected cohort.
  const aiNativeCount = selected?.signalCounts.is_ai_native ?? 0;
  const aiShare = selected && selected.pageCount > 0 ? aiNativeCount / selected.pageCount : 0;
  const aiLeads = cohort === AI_NATIVE_COHORT || aiShare >= AI_LEAD_THRESHOLD;

  const aiCostSection = selected ? (
    <section className="benchmark-section">
      <div className="section-kicker">
        <span>AI COST MODEL</span>
        <span>{aiLeads ? "WHAT NOBODY ELSE MEASURES" : "MINORITY OF THIS COHORT"}</span>
      </div>
      {/* The denominator is the whole cohort, so say how much of it is AI at all.
          Without this line a low percentage reads as a finding about AI pricing
          when it is mostly a statement about the cohort's composition. */}
      <p className="benchmark-meta">
        {aiNativeCount} of {selected.pageCount} pages in this cohort are AI-native
        {aiLeads ? "." : ". Percentages below are shares of the whole cohort."}
      </p>
      <div className="finding-grid">
        {AI_COST_SIGNALS.map((key) => {
          const metadata = getPricingSignalMetadata(key);
          const count = selected.signalCounts[key] ?? 0;
          return (
            <div className="finding-card" key={key}>
              <strong>{Math.round((count / selected.pageCount) * 100)}%</strong>
              <span>{metadata?.label ?? formatToken(key)}</span>
              <small>
                {count} of {selected.pageCount} pages state this
              </small>
            </div>
          );
        })}
      </div>
      <ShareBars
        title="How AI compute is charged"
        question={getPricingChoiceMetadata("ai_cost_passthrough")?.question}
        answered={selected.choiceShares.ai_cost_passthrough?.answered ?? 0}
        items={optionItems("ai_cost_passthrough", selected.choiceShares)}
      />
    </section>
  ) : null;

  return (
    <main className="directory-shell benchmark-shell">
      <section className="benchmark-hero">
        <div>
          <p className="eyebrow">THE PRICING INDEX</p>
          <h1>HOW SOFTWARE PRICES</h1>
        </div>
        <p className="hero-copy">
          Every indexed pricing page, scored against the same question set and aggregated. A number
          on its own means nothing, so nothing here appears without the cohort it was measured
          across.
        </p>
      </section>

      {benchmarks.isLoading ? (
        <div className="directory-message" role="status">
          <Spinner className="mx-auto mb-3" />
          Reading the index…
        </div>
      ) : benchmarks.isError ? (
        <p className="directory-message">The index is not available.</p>
      ) : !data || data.available.length === 0 ? (
        <NotEnoughData
          minimum={data?.minimumCohortSize ?? 10}
          compatible={data?.indexedPages ?? 0}
          total={data?.totalIndexedPages ?? 0}
        />
      ) : (
        <>
          <ToggleGroup
            className="cohort-picker"
            aria-label="Cohort"
            variant="outline"
            spacing={0}
            value={[cohort]}
            onValueChange={(value) => setCohort(value[0] ?? cohort)}
          >
            {data.available.map((option) => (
              <ToggleGroupItem
                key={option.cohort}
                value={option.cohort}
                aria-label={`${option.label}, ${option.pageCount} pages`}
              >
                {option.label}
                <small>{option.pageCount}</small>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {!selected ? (
            <NotEnoughData
              minimum={data.minimumCohortSize}
              compatible={data.indexedPages}
              total={data.totalIndexedPages}
            />
          ) : (
            <>
              <p className="benchmark-meta">
                {selected.pageCount} pages in {selected.label}.{" "}
                {data.computedAt
                  ? `Computed ${formatDate(data.computedAt)}.`
                  : "Computed on this request; no scheduled snapshot exists yet."}{" "}
                <Link to="/methodology">Methodology</Link>
              </p>

              {aiLeads ? aiCostSection : null}

              <section className="benchmark-section">
                <div className="section-kicker">
                  <span>QUALITY DISTRIBUTIONS</span>
                  <span>{selected.pageCount} PAGES</span>
                </div>
                <div className="dist-grid">
                  {[OVERALL_SCORE_KEY, ...Object.keys(PRICING_SCORE_CATALOG)].flatMap((key) => {
                    const distribution = selected.scoreDistributions[key];
                    if (!distribution) return [];
                    return [
                      <DistributionChart
                        key={key}
                        distribution={distribution}
                        label={
                          key === OVERALL_SCORE_KEY
                            ? "Overall"
                            : (getPricingScoreMetadata(key)?.label ?? formatToken(key))
                        }
                        question={getPricingScoreMetadata(key)?.question}
                      />,
                    ];
                  })}
                </div>
              </section>

              <section className="benchmark-section">
                <div className="section-kicker">
                  <span>COMMERCIAL STRUCTURE</span>
                </div>
                <div className="share-grid">
                  {Object.keys(PRICING_CHOICE_CATALOG)
                    .filter((key) => key !== "ai_cost_passthrough")
                    .map((key) => (
                      <ShareBars
                        key={key}
                        title={getPricingChoiceMetadata(key)?.label ?? formatToken(key)}
                        question={getPricingChoiceMetadata(key)?.question}
                        answered={selected.choiceShares[key]?.answered ?? 0}
                        items={optionItems(key, selected.choiceShares)}
                      />
                    ))}
                </div>
              </section>

              {aiLeads ? null : aiCostSection}
            </>
          )}
        </>
      )}
    </main>
  );
}

function optionItems(
  key: string,
  shares: Record<string, { answered: number; options: Record<string, number> }>,
) {
  const options = shares[key]?.options ?? {};
  return Object.entries(options).map(([option, count]) => ({
    key: option,
    label: formatToken(option),
    count,
  }));
}

/**
 * A distribution over three pages is noise presented as authority. Saying so is
 * more useful than drawing it.
 */
function NotEnoughData({
  minimum,
  compatible,
  total,
}: {
  minimum: number;
  compatible: number;
  total: number;
}) {
  return (
    <div className="directory-message">
      <p>
        No cohort has reached {minimum} pages yet, so there is nothing here that would survive
        scrutiny. The current rubric has {compatible} compatible{" "}
        {compatible === 1 ? "page" : "pages"}
        {total === compatible ? "." : ` from ${total} indexed pages.`}
      </p>
      <p>
        <Link to="/">Browse the directory</Link>
      </p>
    </div>
  );
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}
