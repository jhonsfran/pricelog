import { COHORT_MINIMUM } from "@my-better-t-app/api/benchmark";
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
          Each page is captured with Chromium, converted to Markdown, and evaluated in a single call
          against the question set below. A page is published only after a successful capture and a
          complete evaluation. Failed captures and bot challenges are never published.
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
            Groups and metric denominators below {COHORT_MINIMUM} show counts only. This display
            rule does not establish statistical significance or representative sampling.
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
          This release uses Jev Choice and Noul classifications. It does not extract numeric prices
          or generate explanations. Exact price statistics need a validated collection method and
          are deferred. Published terms cannot establish willingness to pay, margins, conversion
          performance, or pricing quality.
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
