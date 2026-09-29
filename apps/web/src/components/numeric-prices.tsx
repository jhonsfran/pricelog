import { monthlyEquivalent, PRICE_SAMPLE_MINIMUM } from "@pricelog/api/numeric-prices";
import { serverUrl } from "@/lib/url";
import type {
  NumericOffer,
  NumericPrices,
  NumericPriceBenchmark,
} from "@pricelog/api/numeric-prices";
import { Link } from "@tanstack/react-router";
import { CellNote, DataCell, DataRow, DataTable, RowHeader } from "./data-table";
import { Monogram } from "./monogram";
import { Disclosure, Evidence } from "./page";
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

/** Offers each page shows as chips before the rest fold into a count. */
const OFFER_CHIPS = 4;

/**
 * Published prices across a category: how many pages were checked, one card per comparable group
 * with its spread, and the pages the numbers come from. Prices from unrelated categories are
 * never pooled, so the view waits for a single category.
 */
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
  if (!category)
    return (
      <p className="mt-6 border border-dashed border-gray-6 px-5 py-6 text-sm text-muted-foreground">
        Choose one product category above to compare published prices. Prices from unrelated
        categories are not pooled.
      </p>
    );
  const pages = examples.filter((page) => page.numericPrices?.offers.length);
  return (
    <section className="grid gap-8 pt-6" aria-label="Published prices">
      <p className="font-mono text-xs text-muted-foreground tabular-nums">
        <strong className="font-medium text-foreground">{prices?.collected ?? 0}</strong> of{" "}
        {pageCount} pages checked for prices ·{" "}
        <strong className="font-medium text-foreground">{prices?.withOffers ?? 0}</strong> with a
        verified base offer · {prices?.unavailable ?? 0} unavailable ·{" "}
        {prices?.notCollected ?? pageCount} not collected
      </p>
      {prices?.groups.length ? (
        <div>
          <ul className="grid gap-3 md:grid-cols-2">
            {prices.groups.map((group) => (
              <li
                key={`${group.currency}:${group.billing}:${group.chargeUnit}`}
                className="grid content-start gap-4 border border-gray-5 bg-gray-2/40 px-5 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-4">
                  <div>
                    <h3 className="text-sm tracking-normal">
                      {group.currency} ·{" "}
                      {group.chargeUnit === "seat" ? "Per seat, monthly" : "Flat fee, monthly"}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {group.billing === "annual"
                        ? "Annual commitment, monthly equivalent"
                        : "Monthly commitment"}
                    </p>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {group.count} {group.count === 1 ? "product" : "products"}
                  </span>
                </div>
                <div>
                  <p className="kicker text-muted-foreground">Median</p>
                  <p className="mt-1 text-2xl leading-none font-[650] tracking-[-0.02em] tabular-nums">
                    {group.median === null ? (
                      <span className="text-sm font-normal text-muted-foreground">
                        Needs {PRICE_SAMPLE_MINIMUM} products
                      </span>
                    ) : (
                      money(group.median, group.currency)
                    )}
                  </p>
                </div>
                <Spread
                  minimum={group.minimum}
                  median={group.median}
                  maximum={group.maximum}
                  currency={group.currency}
                />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Descriptive sample statistics, not market estimates. Each product adds at most one price
            to a group. Annual plans can require paying for the full year.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No comparable prices yet. Prices with an unspecified dollar currency are listed below but
          left out of the statistics.
        </p>
      )}
      {pages.length ? (
        <div>
          <h3 className="text-sm tracking-normal">The pages behind these numbers</h3>
          <ul className="mt-3 border-t border-gray-4">
            {pages.map((page) => {
              const offers = page.numericPrices!.offers;
              return (
                <li key={page.id}>
                  <Link
                    to="/pages/$slug"
                    params={{ slug: page.slug }}
                    search={{ cohort }}
                    className="group flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-4 py-3 transition-colors hover:bg-gray-2"
                  >
                    <span className="flex min-w-40 items-center gap-3">
                      <Monogram domain={page.normalizedDomain} />
                      <strong className="text-[0.9375rem] font-semibold">
                        {page.normalizedDomain}
                      </strong>
                    </span>
                    <span className="flex flex-1 flex-wrap gap-1.5 max-sm:order-3 max-sm:basis-full">
                      {offers.slice(0, OFFER_CHIPS).map((offer, index) => (
                        <span
                          key={index}
                          className="border border-gray-5 px-1.5 font-mono text-2xs leading-5 text-gray-11 tabular-nums"
                        >
                          {offer.plan ? `${offer.plan} ` : ""}
                          {amountLabel(offer)} · {offer.billing}
                        </span>
                      ))}
                      {offers.length > OFFER_CHIPS ? (
                        <span className="font-mono text-2xs leading-5 text-muted-foreground">
                          +{offers.length - OFFER_CHIPS} more
                        </span>
                      ) : null}
                    </span>
                    <span
                      aria-hidden="true"
                      className="text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    >
                      ↗
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** The sample's range as a line, with the median marked where it falls. */
function Spread({
  minimum,
  median,
  maximum,
  currency,
}: {
  minimum: number | null;
  median: number | null;
  maximum: number | null;
  currency: string;
}) {
  if (minimum === null || maximum === null)
    return <p className="text-xs text-muted-foreground">Range needs a larger sample</p>;
  const at =
    median === null || maximum === minimum ? 0.5 : (median - minimum) / (maximum - minimum);
  return (
    <div className="grid gap-1.5">
      <div className="relative h-1.5 bg-gray-5" aria-hidden="true">
        <span
          className="absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-brand-9"
          style={{ left: `${at * 100}%` }}
        />
      </div>
      <p className="flex justify-between font-mono text-2xs text-muted-foreground tabular-nums">
        <span>{money(minimum, currency)}</span>
        <span>{money(maximum, currency)}</span>
      </p>
    </div>
  );
}
