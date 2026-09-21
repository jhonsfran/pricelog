import { COHORT_MINIMUM } from "@my-better-t-app/api/benchmark";
import {
  CHOICE_CONFIDENCE_THRESHOLD,
  PRICING_CHOICE_CATALOG,
  PRICING_CHOICE_GROUPS,
  PRICING_SCORE_CATALOG,
  PRICING_SIGNAL_CATALOG,
  TAG_PROBABILITY_THRESHOLD,
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
          <p className="eyebrow">HOW PRICELOG SCORES</p>
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
          <li>Uncertainty is stored as unknown. It is never converted into a negative fact.</li>
          <li>
            A cohort below {COHORT_MINIMUM} pages is not published, because a distribution over a
            handful of pages is noise presented as authority.
          </li>
          <li>
            Scores are scaled to 0-100 from a five-level scale. The overall score is the mean of
            every dimension.
          </li>
        </ul>
        <p className="methodology-correction">
          If a record is wrong, the capture it was derived from is archived and the evaluation can
          be re-run. Contact us and we will re-scan the page.
        </p>
      </section>

      <section className="methodology-section">
        <div className="section-kicker">
          <span>QUALITY SCORES</span>
          <span>{Object.keys(PRICING_SCORE_CATALOG).length} DIMENSIONS</span>
        </div>
        {Object.entries(PRICING_SCORE_CATALOG).map(([key, entry]) => (
          <article className="methodology-question" key={key}>
            <h3>{entry.label}</h3>
            <p className="methodology-prompt">{entry.question}</p>
            <ol className="methodology-criteria">
              {entry.criteria.map((criterion, index) => (
                <li key={criterion}>
                  <span>{index}</span>
                  {criterion}
                </li>
              ))}
            </ol>
          </article>
        ))}
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
                <td>{entry.question}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
