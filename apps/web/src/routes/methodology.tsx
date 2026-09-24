import { LayerTitle } from "@/components/layer-title";
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
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { formatToken } from "@/components/intelligence-profile";
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
    <main className="profile-shell methodology-shell">
      <Link className="back-link" to="/benchmarks" search={search}>
        <ArrowLeft size={15} />
        Compare pricing
      </Link>

      <section className="profile-heading">
        <div>
          <p className="eyebrow">HOW PRICELOG MEASURES</p>
          <h1>
            <LayerTitle>Methodology</LayerTitle>
          </h1>
        </div>
      </section>

      <section className="methodology-note">
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
        <p className="methodology-correction">
          Each rubric has an immutable content fingerprint and a pinned model version. Changes
          require a new rubric and new evaluation. Archived captures allow each published record to
          be checked against its source.
        </p>
      </section>

      <section className="methodology-note">
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

      <section className="methodology-section">
        <div className="section-kicker">
          <span>CLASSIFICATIONS</span>
          <span>{Object.keys(PRICING_CHOICE_CATALOG).length} QUESTIONS</span>
        </div>
        {PRICING_CHOICE_GROUPS.map((group) => (
          <div key={group.key}>
            <h4 className="choice-group-label">{group.label}</h4>
            {Object.entries(PRICING_CHOICE_CATALOG)
              .filter(([, entry]) => entry.group === group.key)
              .map(([key, entry]) => (
                <article className="methodology-question" key={key}>
                  <h3>{entry.label}</h3>
                  <p className="methodology-prompt">{entry.question}</p>
                  <dl className="methodology-options">
                    {Object.entries(entry.options).map(([option, description]) => (
                      <div key={option}>
                        <dt>{formatToken(option)}</dt>
                        <dd>{description}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
          </div>
        ))}
      </section>

      <section className="methodology-section">
        <div className="section-kicker">
          <span>SIGNALS</span>
          <span>{Object.keys(PRICING_SIGNAL_CATALOG).length} QUESTIONS</span>
        </div>
        <table className="methodology-table">
          <thead>
            <tr>
              <th scope="col">Signal</th>
              <th scope="col">Question</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(PRICING_SIGNAL_CATALOG).map(([key, entry]) => (
              <tr key={key}>
                <th scope="row">{entry.label}</th>
                <td>
                  {entry.question}
                  <p>Stated: {entry.whenTrue}</p>
                  <p>Not established: {entry.whenFalse}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
