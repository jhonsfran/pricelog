import { COHORT_MINIMUM } from "@my-better-t-app/api/benchmark";
import { PRICE_SAMPLE_MINIMUM } from "@my-better-t-app/api/numeric-prices";
import {
  EXPECTED_JEV_MODEL,
  FACT_CONFIDENCE,
  FACT_EVIDENCE_PROBABILITY,
} from "@my-better-t-app/api/pricing-facts";
import {
  CHOICE_CONFIDENCE_THRESHOLD,
  PRICING_CHOICE_CATALOG,
  PRICING_CHOICE_GROUPS,
  PRICING_SIGNAL_CATALOG,
  PRICING_PAGE_SCOPE,
  TAG_PROBABILITY_THRESHOLD,
  NOT_ESTABLISHED_PROBABILITY_THRESHOLD,
} from "@my-better-t-app/api/pricing-intelligence";
import { createFileRoute } from "@tanstack/react-router";
import { DataCell, DataRow, DataTable, RowHeader } from "@/components/data-table";
import { formatToken } from "@/components/intelligence-profile";
import { BackLink, Definitions, PageHeader, PageShell, SectionHeading } from "@/components/page";
import { parseCategorySearch } from "@/lib/comparison-search";

export const Route = createFileRoute("/methodology")({
  component: MethodologyPage,
  validateSearch: parseCategorySearch,
});

/**
 * The published questions use the same catalog as the evaluation prompt.
 */
function MethodologyPage() {
  const search = Route.useSearch();
  return (
    <PageShell narrow>
      <BackLink to="/benchmarks" search={search}>
        Compare pricing
      </BackLink>
      <PageHeader eyebrow="How Pricelog measures" title="Methodology" />

      <section className={prose}>
        <h2>What these numbers measure</h2>
        <p>
          Pricelog records <strong>what a captured pricing page states</strong>. A missing
          disclosure does not establish that a feature is absent. The sample consists of submitted
          pricing pages. It does not represent the whole market or measure buyer sentiment,
          willingness to pay, margins, conversion performance, or pricing quality.
        </p>
        <p>
          Chromium captures each page. The rendered Markdown is the evidence source for typed Jev
          questions. HTML and screenshots remain archived for capture checks. Jev is the only model.
          Failed captures and bot challenges are not published. Offer fact collection has its own
          availability status, so a page profile can remain available when fact collection fails.
        </p>
        <h2>Current comparison sample</h2>
        <p>
          Current comparisons include only active pages evaluated with the current rubric and
          exactly {EXPECTED_JEV_MODEL}. Captures must be within the last 14 days and cannot have a
          future timestamp. Charts and their linked directory lists use these same rules. Older or
          incompatible records remain available on their profile pages with an exclusion notice.
        </p>
        <ul>
          <li>
            Page-level choices require at least {CHOICE_CONFIDENCE_THRESHOLD} confidence. Unknown
            answers remain uncertain.
          </li>
          <li>A tag is published only at {TAG_PROBABILITY_THRESHOLD} probability or above.</li>
          <li>
            A charging disclosure is not established at probability{" "}
            {NOT_ESTABLISHED_PROBABILITY_THRESHOLD} or below. Values between these boundaries remain
            uncertain.
          </li>
          <li>
            Not disclosed means the captured source does not state the policy. Not applicable
            requires explicit evidence that the policy cannot apply. Unknown means the evidence is
            ambiguous.
          </li>
          <li>
            Charging components can overlap. A page can state subscription, seat, and credit charges
            together.
          </li>
          <li>
            Charging and policy percentages use all eligible pages in the selected sample as their
            denominator. Not applicable, not disclosed, and uncertain counts remain visible.
          </li>
          <li>
            Practice groups and metric denominators below {COHORT_MINIMUM} show counts only. This
            display rule does not establish statistical significance or representative sampling.
          </li>
          <li>
            Raw probabilities remain stored. Acceptance thresholds are rules, not measured accuracy
            claims. Synthetic evaluation fixtures do not establish accuracy on production pages.
          </li>
        </ul>
        <p className="border-t border-gray-4 pt-3.5 text-muted-foreground">
          Each rubric has an immutable content fingerprint and a pinned model version. Changes
          require a new rubric and new evaluation. Archived captures allow each published record to
          be checked against its source.
        </p>
      </section>

      <section className={prose}>
        <h2>Source scope</h2>
        <p>{PRICING_PAGE_SCOPE}</p>
        <h2>Weekly comparisons</h2>
        <p>
          We compare the latest successful captures from adjacent completed UTC weeks. Both captures
          must use the same rubric and exactly {EXPECTED_JEV_MODEL}. Code compares accepted numeric
          facts for the same named offer, currency, unit, and billing commitment. Independent Jev
          evidence checks must support each published change. Renamed offers, duplicate matches,
          missing attribution, and comparisons beyond request limits remain unresolved.
        </p>
        <p>
          Each item includes literal evidence and links to both archived captures. A newly stated
          term is a disclosure change. A missing term does not prove a product change. The
          commercial change rate counts distinct pages with a verified commercial change divided by
          eligible paired pages. New and missing pages appear separately.
        </p>
        <h2>Prices and interpretation</h2>
        <p>
          Code finds numeric literals and offer names in the archived source. Jev Choice questions
          classify bounded candidates. Code copies the selected values and checks their units. Fact
          choices require at least {FACT_CONFIDENCE} confidence. Independent Noul evidence checks
          require at least {FACT_EVIDENCE_PROBABILITY}. Jev scores never become money amounts.
          Missing disclosure is checked against the full captured source, not a local excerpt.
        </p>
        <p>
          Offer facts include base and seat prices, usage and outcome rates, overage, credit packs,
          AI add-ons, allowances, credit conversion, minimum seats, purchased credit expiry, and
          included credit rollover limits. Each accepted fact retains literal evidence. Policies are
          also collected for each accepted offer. Unresolved numeric and policy counts remain
          visible. Not collected, unavailable, and collected with no accepted facts are distinct
          states.
        </p>
        <p>
          The published-price table shows all accepted paid recurring flat and seat offers.
          Promotional, crossed-out, competitor, add-on, and one-time prices are excluded from
          baseline comparisons. A bare dollar sign has unspecified currency and cannot enter price
          statistics. Unsupported or ambiguous number formats remain uncollected. A capture may not
          expose all billing-toggle variants.
        </p>
        <p>
          Category medians and ranges require {PRICE_SAMPLE_MINIMUM} comparable products, grouped by
          currency, commitment and charging unit. Annual totals are divided by twelve only for a
          labeled monthly equivalent. This does not make them monthly subscriptions. Each product
          contributes at most one baseline price per group. The broad AI overview does not pool
          unrelated categories. These are sample statistics, not representative market estimates.
        </p>
        <p>
          Included usage and overage rates must belong to the same offer and billing commitment.
          Missing values do not mean zero, unlimited usage, or free overage. Credits from different
          vendors are not equivalent. Exact spend can also depend on minimum seats, taxes, model
          choice, and additional charges. The facts do not estimate a workload bill.
        </p>
        <p>
          Pricelog is by{" "}
          <a href="https://unprice.dev" target="_blank" rel="noreferrer">
            Unprice
          </a>
          . A missing disclosure is not a recommendation to buy a billing product.
        </p>
      </section>

      <section className="pt-10">
        <SectionHeading
          title="Classifications"
          meta={`${Object.keys(PRICING_CHOICE_CATALOG).length} questions`}
          className="border-b"
        />
        {PRICING_CHOICE_GROUPS.map((group) => (
          <div key={group.key} className="pt-6">
            <h4 className="text-sm tracking-normal">{group.label}</h4>
            {Object.entries(PRICING_CHOICE_CATALOG)
              .filter(([, entry]) => entry.group === group.key)
              .map(([key, entry]) => (
                <article className="grid gap-3 border-b border-gray-4 py-5" key={key}>
                  <h3 className="text-base">{entry.label}</h3>
                  <p>{entry.question}</p>
                  <Definitions
                    items={Object.entries(entry.options).map(([option, description]) => ({
                      key: option,
                      term: formatToken(option),
                      detail: description,
                    }))}
                  />
                </article>
              ))}
          </div>
        ))}
      </section>

      <section className="pt-10">
        <SectionHeading
          title="Signals"
          meta={`${Object.keys(PRICING_SIGNAL_CATALOG).length} questions`}
        />
        <DataTable columns={["Signal", "Question"]} className="min-w-0">
          {Object.entries(PRICING_SIGNAL_CATALOG).map(([key, entry]) => (
            <DataRow key={key}>
              <RowHeader className="w-48 max-sm:w-32">{entry.label}</RowHeader>
              <DataCell className="grid gap-1.5 font-sans text-sm text-foreground">
                {entry.question}
                <span className="text-muted-foreground">Stated: {entry.whenTrue}</span>
                <span className="text-muted-foreground">Not established: {entry.whenFalse}</span>
              </DataCell>
            </DataRow>
          ))}
        </DataTable>
      </section>
    </PageShell>
  );
}

// Long-form reading: a measure a person can hold, headings in the display face.
const prose =
  "grid max-w-prose gap-4 pt-9 text-base/7 text-gray-11 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:text-foreground [&_h2:first-child]:mt-0 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-2 [&_ul]:pl-5 [&_ul]:marker:text-gray-8";
