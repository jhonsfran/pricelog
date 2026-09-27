import { monthlyEquivalent, PRICE_SAMPLE_MINIMUM } from "@pricelog/api/numeric-prices";
import { serverUrl } from "@/lib/url";
import type {
  NumericOffer,
  NumericPrices,
  NumericPriceBenchmark,
} from "@pricelog/api/numeric-prices";
import { Link } from "@tanstack/react-router";
import { CellNote, DataCell, DataRow, DataTable, RowHeader } from "./data-table";
import { Disclosure, Evidence, Notice, SectionHeading, StatRow } from "./page";
import { Panel } from "./panel";

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
    <Panel
      role="region"
      aria-label="Published prices"
      title="Published prices"
      description={
        !prices
          ? "Numeric prices have not been collected for this capture. A new scan will collect them."
          : prices.status !== "collected"
            ? "Numeric prices could not be collected for this capture. Published pricing practices remain available."
            : !prices.offers.length
              ? "No numeric baseline offer could be verified from this capture. This does not mean the product is free."
              : "All accepted paid flat fees and per-seat rates, with their billing commitments. These prices do not estimate a total bill."
      }
    >
      {prices?.status === "collected" && prices.offers.length ? (
        <>
          <DataTable columns={["Offer", "Published price", "Included usage", "Overage"]}>
            {prices.offers.map((offer, index) => (
              <DataRow key={`${offer.billing}:${offer.chargeUnit}:${index}`}>
                <RowHeader>
                  {offer.plan ??
                    (offer.chargeUnit === "seat" ? "Per-seat offer" : "Flat-fee offer")}
                  <CellNote>
                    {offer.billing === "annual" ? "Annual commitment" : "Monthly commitment"}
                  </CellNote>
                </RowHeader>
                <DataCell>
                  <strong>{amountLabel(offer)}</strong>
                  {offer.currency === "DOLLAR_UNSPECIFIED" ? (
                    <CellNote>Dollar currency unspecified; excluded from comparisons</CellNote>
                  ) : null}
                  {offer.amountPeriod === "year" && monthlyEquivalent(offer) !== null ? (
                    <CellNote>
                      {money(monthlyEquivalent(offer)!, offer.currency)} / month equivalent
                    </CellNote>
                  ) : null}
                </DataCell>
                <DataCell>
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
                </DataCell>
                <DataCell>
                  {offer.overage ? (
                    <>
                      {money(offer.overage.amount, offer.overage.currency)} /{" "}
                      {offer.overage.quantity} {offer.overage.unit}
                      {offer.overage.currency === "DOLLAR_UNSPECIFIED" ? (
                        <CellNote>Dollar currency unspecified</CellNote>
                      ) : null}
                    </>
                  ) : (
                    "Not established"
                  )}
                </DataCell>
              </DataRow>
            ))}
          </DataTable>
          <Disclosure summary="Price evidence and collection method" className="mt-0">
            <p className="text-muted-foreground">
              Amounts are copied from the source. Jev validates their billing context and offer
              association. Capture variants, minimum seats, taxes, and other charges can affect the
              amount you pay. Unknown allowances are not zero or unlimited.
            </p>
            {prices.offers.map((offer, index) => (
              <div className="grid gap-2" key={index}>
                <h3 className="text-sm">
                  {amountLabel(offer)} · {offer.billing} commitment
                </h3>
                <Evidence>{offer.evidence}</Evidence>
                {offer.includedUsage ? <Evidence>{offer.includedUsage.evidence}</Evidence> : null}
                {offer.overage ? <Evidence>{offer.overage.evidence}</Evidence> : null}
              </div>
            ))}
            <p className="font-mono text-2xs text-muted-foreground">
              {prices.version} · {prices.model}
            </p>
            {sourceUrl ? (
              <p>
                <a href={serverUrl(sourceUrl)} target="_blank" rel="noreferrer">
                  Read the archived source
                </a>
              </p>
            ) : null}
          </Disclosure>
        </>
      ) : null}
    </Panel>
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
  cohort,
}: {
  prices?: NumericPriceBenchmark | null;
  category: boolean;
  examples: PriceExample[];
  pageCount: number;
  cohort: string;
}) {
  return (
    <section className="pt-6" aria-label="Price benchmarks">
      <SectionHeading title="Price benchmarks" meta="Comparable offers only" />
      {!category ? (
        <Notice>
          Choose a product category above to compare numeric prices. Prices from unrelated
          categories are not pooled.
        </Notice>
      ) : (
        <div className="grid gap-5">
          <StatRow
            items={[
              { label: "Checked for prices", value: `${prices?.collected ?? 0} / ${pageCount}` },
              { label: "Verified baseline offers", value: prices?.withOffers ?? 0 },
              { label: "Unavailable", value: prices?.unavailable ?? 0 },
              { label: "Not collected", value: prices?.notCollected ?? pageCount },
            ]}
          />
          {!prices?.groups.length ? (
            <p className="text-muted-foreground">
              No comparable numeric prices yet. Prices with an unspecified dollar currency are shown
              below but excluded from statistics.
            </p>
          ) : (
            <>
              <p className="max-w-prose text-muted-foreground">
                Monthly amounts below retain their billing commitment. Annual plans can require
                payment for the full year. Each product contributes at most one price to each group.
              </p>
              <DataTable
                columns={["Comparison group", "Products", "Sample median", "Sample range"]}
              >
                {prices.groups.map((group) => (
                  <DataRow key={`${group.currency}:${group.billing}:${group.chargeUnit}`}>
                    <RowHeader>
                      {group.currency} ·{" "}
                      {group.chargeUnit === "seat" ? "Per seat / month" : "Flat fee / month"}
                      <CellNote>
                        {group.billing === "annual"
                          ? "Annual commitment, monthly equivalent"
                          : "Monthly commitment"}
                      </CellNote>
                    </RowHeader>
                    <DataCell>{group.count}</DataCell>
                    <DataCell>
                      {group.median === null ? (
                        `Needs ${PRICE_SAMPLE_MINIMUM} products`
                      ) : (
                        <strong>{money(group.median, group.currency)}</strong>
                      )}
                    </DataCell>
                    <DataCell>
                      {group.minimum === null || group.maximum === null
                        ? "Small sample"
                        : `${money(group.minimum, group.currency)} to ${money(group.maximum, group.currency)}`}
                    </DataCell>
                  </DataRow>
                ))}
              </DataTable>
              <p className="text-xs text-muted-foreground">
                Descriptive sample statistics, not market estimates. Product capabilities and
                allowances differ. Vendor credits and overage rates are not averaged.
              </p>
            </>
          )}
          <div>
            {examples
              .filter((page) => page.numericPrices?.offers.length)
              .map((page) => (
                <Disclosure
                  key={page.id}
                  summary={`${page.normalizedDomain}: ${page.numericPrices?.offers
                    .map(
                      (offer) =>
                        `${amountLabel(offer)} · ${offer.billing} commitment${offer.currency === "DOLLAR_UNSPECIFIED" ? " · currency unspecified" : ""}`,
                    )
                    .join("; ")}`}
                >
                  <p>
                    <Link to="/pages/$slug" params={{ slug: page.slug }} search={{ cohort }}>
                      Open product record
                    </Link>
                  </p>
                  <NumericPricesPanel
                    prices={page.numericPrices}
                    sourceUrl={`/api/public/pages/${page.id}/runs/${page.runId}/source`}
                  />
                </Disclosure>
              ))}
          </div>
        </div>
      )}
    </section>
  );
}
