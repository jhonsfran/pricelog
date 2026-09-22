import { monthlyEquivalent, PRICE_SAMPLE_MINIMUM } from "@my-better-t-app/api/numeric-prices";
import type {
  NumericOffer,
  NumericPrices,
  NumericPriceBenchmark,
} from "@my-better-t-app/api/numeric-prices";
import { Link } from "@tanstack/react-router";
import { ENV } from "@/env.public";

function money(amount: string | number, currency: string) {
  if (currency === "DOLLAR_UNSPECIFIED")
    return `$${Number(amount).toLocaleString("en", { maximumFractionDigits: 6 })}`;
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 6,
  }).format(Number(amount));
}
function amountLabel(offer: NumericOffer) {
  return `${money(offer.amount, offer.currency)} / ${offer.chargeUnit === "seat" ? "seat / " : ""}${offer.amountPeriod}`;
}
export function NumericPricesPanel({
  prices,
  sourceUrl,
}: {
  prices?: NumericPrices | null;
  sourceUrl?: string | null;
}) {
  return (
    <section className="numeric-prices" aria-label="Published prices">
      <h2>Published prices</h2>
      {!prices ? (
        <p>
          Numeric prices have not been collected for this capture. A new scan will collect them.
        </p>
      ) : prices.status !== "collected" ? (
        <p>
          Numeric prices could not be collected for this capture. Published pricing practices remain
          available.
        </p>
      ) : !prices.offers.length ? (
        <p>
          No numeric baseline offer could be verified from this capture. This does not mean the
          product is free.
        </p>
      ) : (
        <>
          <p className="benchmark-meta">
            Lowest verified paid flat fee and per-seat rate for each billing commitment. These are
            distinct offers, not a total cost estimate.
          </p>
          <div className="price-table-scroll">
            <table className="price-table">
              <thead>
                <tr>
                  <th>Offer</th>
                  <th>Published price</th>
                  <th>Included usage</th>
                  <th>Overage</th>
                </tr>
              </thead>
              <tbody>
                {prices.offers.map((offer, index) => (
                  <tr key={`${offer.billing}:${offer.chargeUnit}:${index}`}>
                    <th scope="row">
                      {offer.plan ??
                        (offer.chargeUnit === "seat" ? "Per-seat offer" : "Flat-fee offer")}
                      <small>
                        {offer.billing === "annual" ? "Annual commitment" : "Monthly commitment"}
                      </small>
                    </th>
                    <td>
                      <strong>{amountLabel(offer)}</strong>
                      {offer.currency === "DOLLAR_UNSPECIFIED" ? (
                        <small>Dollar currency unspecified; excluded from comparisons</small>
                      ) : null}
                      {offer.amountPeriod === "year" && monthlyEquivalent(offer) !== null ? (
                        <small>
                          {money(monthlyEquivalent(offer)!, offer.currency)} / month equivalent
                        </small>
                      ) : null}
                    </td>
                    <td>
                      {offer.includedUsage ? (
                        <>
                          {offer.includedUsage.amount} {offer.includedUsage.unit}
                          {offer.includedUsage.period === "unknown"
                            ? " · period not established"
                            : ` / ${offer.includedUsage.period.replace("one_time", "one-time allowance")}`}
                        </>
                      ) : (
                        "Not established"
                      )}
                    </td>
                    <td>
                      {offer.overage ? (
                        <>
                          {money(offer.overage.amount, offer.overage.currency)} /{" "}
                          {offer.overage.quantity} {offer.overage.unit}
                          {offer.overage.currency === "DOLLAR_UNSPECIFIED" ? (
                            <small>Dollar currency unspecified</small>
                          ) : null}
                        </>
                      ) : (
                        "Not established"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="metric-definitions">
            <summary>Price evidence and collection method</summary>
            <p>
              Amounts are copied from the source. Jev validates their billing context and offer
              association. Capture variants, minimum seats, taxes, and other charges can affect the
              amount you pay. Unknown allowances are not zero or unlimited.
            </p>
            {prices.offers.map((offer, index) => (
              <div key={index}>
                <h3>
                  {amountLabel(offer)} · {offer.billing} commitment
                </h3>
                <blockquote className="price-evidence">{offer.evidence}</blockquote>
                {offer.includedUsage ? (
                  <blockquote className="price-evidence">{offer.includedUsage.evidence}</blockquote>
                ) : null}
                {offer.overage ? (
                  <blockquote className="price-evidence">{offer.overage.evidence}</blockquote>
                ) : null}
              </div>
            ))}
            <p>
              {prices.version} · {prices.model}
            </p>
            {sourceUrl ? (
              <a
                href={`${ENV.VITE_SERVER_URL.replace(/\/$/, "")}${sourceUrl}`}
                target="_blank"
                rel="noreferrer"
              >
                Read the archived source
              </a>
            ) : null}
          </details>
        </>
      )}
    </section>
  );
}

type PriceExample = {
  id: string;
  slug: string;
  runId: string;
  displayName: string | null;
  normalizedDomain: string;
  numericPrices?: NumericPrices | null;
};
export function NumericBenchmarkPanel({
  prices,
  category,
  examples,
  pageCount,
}: {
  prices?: NumericPriceBenchmark | null;
  category: boolean;
  examples: PriceExample[];
  pageCount: number;
}) {
  return (
    <section className="benchmark-section numeric-prices" aria-label="Price benchmarks">
      <div className="section-kicker">
        <span>PRICE BENCHMARKS</span>
        <span>COMPARABLE OFFERS ONLY</span>
      </div>
      {!category ? (
        <p>
          Choose a product category above to compare numeric prices. Prices from unrelated
          categories are not pooled.
        </p>
      ) : (
        <>
          <p className="benchmark-meta">
            {prices?.collected ?? 0} of {pageCount} pages checked for numeric prices.{" "}
            {prices?.withOffers ?? 0} have verified baseline offers. {prices?.unavailable ?? 0}{" "}
            unavailable; {prices?.notCollected ?? pageCount} not collected.
          </p>
          {!prices?.groups.length ? (
            <p>
              No comparable numeric prices yet. Prices with an unspecified dollar currency are shown
              below but excluded from statistics.
            </p>
          ) : (
            <>
              <p>
                Monthly amounts below retain their billing commitment. Annual plans can require
                payment for the full year. Each product contributes at most one price to each group.
              </p>
              <div className="price-table-scroll">
                <table className="price-table">
                  <thead>
                    <tr>
                      <th>Comparison group</th>
                      <th>Products</th>
                      <th>Sample median</th>
                      <th>Sample range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prices.groups.map((group) => (
                      <tr key={`${group.currency}:${group.billing}:${group.chargeUnit}`}>
                        <th scope="row">
                          {group.currency} ·{" "}
                          {group.chargeUnit === "seat" ? "Per seat / month" : "Flat fee / month"}
                          <small>
                            {group.billing === "annual"
                              ? "Annual commitment, monthly equivalent"
                              : "Monthly commitment"}
                          </small>
                        </th>
                        <td>{group.count}</td>
                        <td>
                          {group.median === null
                            ? `Needs ${PRICE_SAMPLE_MINIMUM} products`
                            : money(group.median, group.currency)}
                        </td>
                        <td>
                          {group.minimum === null || group.maximum === null
                            ? "Small sample"
                            : `${money(group.minimum, group.currency)} to ${money(group.maximum, group.currency)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="benchmark-meta">
                Descriptive sample statistics, not market estimates. Product capabilities and
                allowances differ. Vendor credits and overage rates are not averaged.
              </p>
            </>
          )}
          {examples
            .filter((page) => page.numericPrices?.offers.length)
            .map((page) => (
              <details className="metric-definitions" key={page.id}>
                <summary>
                  {page.displayName ?? page.normalizedDomain}:{" "}
                  {page.numericPrices?.offers
                    .map(
                      (offer) =>
                        `${amountLabel(offer)} · ${offer.billing} commitment${offer.currency === "DOLLAR_UNSPECIFIED" ? " · currency unspecified" : ""}`,
                    )
                    .join("; ")}
                </summary>
                <Link to="/pages/$slug" params={{ slug: page.slug }}>
                  Open product record
                </Link>
                <NumericPricesPanel
                  prices={page.numericPrices}
                  sourceUrl={`/api/public/pages/${page.id}/runs/${page.runId}/source`}
                />
              </details>
            ))}
        </>
      )}
    </section>
  );
}
