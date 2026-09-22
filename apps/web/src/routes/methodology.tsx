import { COHORT_MINIMUM } from "@my-better-t-app/api/benchmark";
import { PRICE_SAMPLE_MINIMUM } from "@my-better-t-app/api/numeric-prices";
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

export const Route = createFileRoute("/methodology")({ component: MethodologyPage });

/**
 * Rendered from the same catalog the evaluation prompt is built from, so the
 * published question and the asked question are the same string. If they could
 * differ, this page would be marketing rather than methodology.
 */
function MethodologyPage() {
  return (
    <main className="profile-shell methodology-shell">
      <Link className="back-link" to="/benchmarks">
        <ArrowLeft size={15} />
        The index
      </Link>

      <section className="profile-heading">
        <div>
          <p className="eyebrow">HOW PRICELOG MEASURES</p>
          <h1>Methodology</h1>
        </div>
      </section>

      <section className="methodology-note">
        <h2>What these numbers measure</h2>
        <p>
          Pricelog measures <strong>what a pricing page states</strong>, not what a product does. A
          missing signal means the page does not establish it. It does not mean the feature is
          absent. Every aggregate on this site is a claim about public disclosure.
        </p>
        <p>
          Each page is captured with Chromium, converted to Markdown, and evaluated with typed
          questions against the full source. A page is published only after a successful capture and
          a complete practice evaluation. Numeric collection has a separate availability status.
          Failed captures and bot challenges are never published.
        </p>
        <ul>
          <li>
            A classification is published only at {CHOICE_CONFIDENCE_THRESHOLD} confidence or above.
          </li>
          <li>A tag is published only at {TAG_PROBABILITY_THRESHOLD} probability or above.</li>
          <li>
            A charging disclosure is not established at probability{" "}
            {NOT_ESTABLISHED_PROBABILITY_THRESHOLD} or below. Values between these boundaries remain
            uncertain.
          </li>
          <li>
            Not disclosed is an accepted statement about this source. Unknown means the
            classification remains ambiguous.
          </li>
          <li>
            Charging components can overlap. A page can state subscription, seat, and credit charges
            together.
          </li>
          <li>
            Policy comparisons exclude not applicable answers. Every metric shows classified,
            uncertain, and excluded counts.
          </li>
          <li>
            Practice groups and metric denominators below {COHORT_MINIMUM} show counts only. This
            display rule does not establish statistical significance or representative sampling.
          </li>
          <li>
            Raw probabilities remain stored. Publication thresholds are rules, not measured accuracy
            claims. Model accuracy has not yet been established on a held-out human-labeled dataset.
          </li>
        </ul>
        <p className="methodology-correction">
          If a record is wrong, the capture it was derived from is archived and the evaluation can
          be re-run. Contact us and we will re-scan the page.
        </p>
      </section>

      <section className="methodology-note">
        <h2>Source scope</h2>
        <p>{PRICING_PAGE_SCOPE}</p>
        <h2>Weekly comparisons</h2>
        <p>
          We compare the latest successful captures from adjacent completed UTC weeks. Both captures
          must use compatible rubric and model versions. A different model answer alone is not a
          commercial change. Changed source content and accepted evidence checks must support each
          published item. Comparisons that exceed the evaluator request limit remain uncertain.
        </p>
        <p>
          Each item includes literal evidence and links to both archived captures. A newly explicit
          term is a disclosure change. The commercial change rate counts distinct pages with a
          verified commercial change divided by eligible paired pages. New and missing pages appear
          separately.
        </p>
        <h2>Prices and interpretation</h2>
        <p>
          Code copies exact numeric literals from the archived source. Jev Choice questions select
          candidates and classify billing terms, currency and charging units. Separate Noul checks
          must validate the base offer's eligibility, billing and charging terms at 0.90 or above.
          Required Choice classifications need at least 0.90 confidence. Code checks exact numeric
          literals and bare dollar markers. These thresholds are publication rules, not measured
          accuracy. Jev scores are never used as money amounts.
        </p>
        <p>
          We collect the lowest verified paid flat fee and per-seat rate for monthly and annual
          commitments. Free, promotional, crossed-out, competitor, add-on and one-time prices do not
          qualify. A bare dollar sign is shown with an unspecified currency and excluded from
          comparisons. Unsupported or ambiguous number formats remain uncollected. Captures may not
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
          Included usage and overage rates must pass a separate attribution check at 0.95 or above
          and belong to the same offer. Missing values do not mean zero, unlimited usage or free
          overage. Credits from different vendors are not equivalent. Exact spend can also depend on
          minimum seats, taxes, model choice and additional charges. Published terms cannot
          establish willingness to pay, margins, conversion performance or pricing quality. Numeric
          price changes are not yet included in the weekly change report.
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
