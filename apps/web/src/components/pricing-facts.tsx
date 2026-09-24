import type { FactUnit, NumericFact, PricingFacts } from "@my-better-t-app/api/pricing-facts";
import { getPricingChoiceLabel } from "@my-better-t-app/api/pricing-intelligence";
import { formatToken } from "@/components/intelligence-profile";
import { ENV } from "@/env.public";

function units(amount: string, unit: FactUnit) {
  if (unit === "flat") return amount;
  if (unit === "gb") return `${amount} GB`;
  return `${amount} ${unit}${Number(amount) === 1 ? "" : "s"}`;
}

function factValue(fact: NumericFact) {
  const amount = fact.currency
    ? `${fact.currency === "DOLLAR_UNSPECIFIED" ? "$" : fact.currency} ${fact.amount}`
    : units(fact.amount, fact.unit);
  if (fact.quantity !== null && fact.quantityUnit !== null) {
    return `${amount} / ${units(fact.quantity, fact.quantityUnit)}`;
  }
  return fact.key === "seat_price" ? `${amount} / seat` : amount;
}

const billingLabels = {
  monthly: "Monthly commitment",
  annual: "Annual commitment",
  one_time: "One-time purchase",
  usage: "Usage charge",
  unknown: "Billing not established",
} as const;

const periodLabels = {
  month: "Per month",
  year: "Per year",
  one_time: "One-time amount",
  unknown: "Period not established",
} as const;

export function PricingFactsPanel({
  facts,
  sourceUrl,
}: {
  facts?: PricingFacts | null;
  sourceUrl?: string | null;
}) {
  const offers = [
    ...new Set([
      ...(facts?.facts.map((fact) => fact.offer) ?? []),
      ...(facts?.policies.map((policy) => policy.offer) ?? []),
    ]),
  ];

  return (
    <section className="numeric-prices" aria-label="Pricing facts by offer">
      <h2>Pricing facts by offer</h2>
      {!facts ? (
        <p>Offer facts have not been collected for this capture. A new scan will collect them.</p>
      ) : facts.status === "unavailable" ? (
        <p>
          Offer fact collection is unavailable for this capture. This does not establish that prices
          or policies are absent.
        </p>
      ) : (
        <>
          <p className="benchmark-meta">
            {facts.coverage.accepted} accepted numeric facts from {facts.coverage.candidates}{" "}
            candidates. {facts.coverage.uncertain} numeric candidates and{" "}
            {facts.coverage.policyUncertain} policy answers remain unresolved.{" "}
            {facts.coverage.ignored} candidates were excluded.
          </p>
          {!offers.length ? (
            <p>No offer facts were accepted. This does not mean the product is free.</p>
          ) : null}
          {offers.map((offer) => {
            const numeric = facts.facts.filter((fact) => fact.offer === offer);
            const policies = facts.policies.filter((policy) => policy.offer === offer);
            return (
              <div key={offer === null ? "unattributed" : `offer:${offer}`}>
                <h3>{offer ?? "Offer not established"}</h3>
                {offer === null ? (
                  <p className="benchmark-meta">
                    These facts cannot be matched to an offer across captures.
                  </p>
                ) : null}
                {numeric.length ? (
                  <div className="price-table-scroll">
                    <table className="price-table">
                      <thead>
                        <tr>
                          <th scope="col">Fact</th>
                          <th scope="col">Published value</th>
                          <th scope="col">Terms</th>
                          <th scope="col">Source evidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {numeric.map((fact, index) => (
                          <tr key={`${fact.key}:${fact.evidence.start}:${index}`}>
                            <th scope="row">{formatToken(fact.key)}</th>
                            <td>
                              <strong>{factValue(fact)}</strong>
                              {fact.currency === "DOLLAR_UNSPECIFIED" ? (
                                <small>Dollar currency not established</small>
                              ) : null}
                              {(fact.key.endsWith("_rate") || fact.key === "credit_conversion") &&
                              (fact.quantity === null || fact.quantityUnit === null) ? (
                                <small>Rate quantity not established</small>
                              ) : null}
                            </td>
                            <td>
                              {billingLabels[fact.billing]}
                              <small>{periodLabels[fact.period]}</small>
                            </td>
                            <td>
                              <details>
                                <summary>Read evidence</summary>
                                <blockquote className="price-evidence">
                                  {fact.evidence.text}
                                </blockquote>
                              </details>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {policies.length ? (
                  <div className="price-table-scroll">
                    <table className="price-table">
                      <thead>
                        <tr>
                          <th scope="col">Policy</th>
                          <th scope="col">Answer</th>
                          <th scope="col">Source evidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {policies.map((policy) => (
                          <tr key={policy.key}>
                            <th scope="row">{getPricingChoiceLabel(policy.key)}</th>
                            <td>{formatToken(policy.choice)}</td>
                            <td>
                              {policy.evidence ? (
                                <details>
                                  <summary>Read evidence</summary>
                                  <blockquote className="price-evidence">
                                    {policy.evidence.text}
                                  </blockquote>
                                </details>
                              ) : policy.choice === "not_disclosed" ? (
                                "No disclosure found in this capture"
                              ) : (
                                "No accepted evidence"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            );
          })}
          <p className="benchmark-meta">
            Missing disclosure does not establish product absence. Unknown amounts are not zero.
            These facts do not estimate a total bill.
          </p>
          <details className="metric-definitions">
            <summary>Collection details</summary>
            <p>
              {facts.version} · {facts.model ?? "Model not recorded"}
            </p>
            <p>
              Code copies numeric values from the archived source. Jev classifies each fact and
              checks its evidence. Acceptance thresholds are not measured accuracy.
            </p>
          </details>
        </>
      )}
      {sourceUrl ? (
        <p>
          <a
            href={`${ENV.VITE_SERVER_URL.replace(/\/$/, "")}${sourceUrl}`}
            target="_blank"
            rel="noreferrer"
          >
            Read the archived source
          </a>
        </p>
      ) : null}
    </section>
  );
}
