import { EXPECTED_JEV_MODEL } from "@pricelog/api/pricing-facts";
import {
  CHOICE_CONFIDENCE_THRESHOLD,
  JEV_CHOICE_KEYS,
  PRICING_CHOICE_CATALOG,
  PRICING_SIGNAL_CATALOG,
  PRICING_PAGE_SCOPE,
  STATED_CHOICE_THRESHOLD,
} from "@pricelog/api/pricing-intelligence";
import { createFileRoute } from "@tanstack/react-router";
import { DataCell, DataRow, DataTable, RowHeader } from "@/components/data-table";
import { formatToken } from "@/lib/format";
import { BackLink, Definitions, PageHeader, PageShell, SectionHeading } from "@/components/page";
import { parseCategorySearch } from "@/lib/comparison-search";

export const Route = createFileRoute("/methodology")({
  component: MethodologyPage,
  validateSearch: parseCategorySearch,
});

function MethodologyPage() {
  const search = Route.useSearch();
  return (
    <PageShell narrow>
      <BackLink to="/benchmarks" search={search}>
        Compare pricing
      </BackLink>
      <PageHeader eyebrow="How Pricelog measures" title="Methodology" />
      <section className={prose}>
        <h2>What we record</h2>
        <p>
          Pricelog records stated terms on public pricing pages that users submit. The sample is not
          a market census. A missing disclosure does not prove that a feature is absent.
        </p>
        <p>
          Chromium saves the rendered HTML, the visible text of each pricing state (for example
          monthly and yearly), and a full-page screenshot. Prices the page declares as schema.org
          data are added to that text. The archive is the evidence for each scan.
        </p>
        <h2>How a claim becomes public</h2>
        <ul>
          <li>An extraction model copies every price and feature line from the captured text.</li>
          <li>Code keeps only quotes that appear word for word in that text.</li>
          <li>
            Jev labels each price (flat or per seat, monthly or annual, usage, add-on, free, custom,
            or not this plan&apos;s price) and answers one yes/no question per feature row. A claim
            publishes at {STATED_CHOICE_THRESHOLD} or more; anything else goes to review.
          </li>
          <li>
            Jev also classifies the product category, accepted at {CHOICE_CONFIDENCE_THRESHOLD}{" "}
            confidence, and three monetization questions, accepted at {STATED_CHOICE_THRESHOLD}{" "}
            unless the page does not state them.
          </li>
          <li>
            Every other profile field and the monetization numbers are computed from the verified
            prices and features.
          </li>
        </ul>
        <p>
          The public page shows accepted claims. The page owner also sees the claims that need
          review. These thresholds are acceptance rules, not measured accuracy.
        </p>
        <h2>Source and comparisons</h2>
        <p>{PRICING_PAGE_SCOPE}</p>
        <p>
          Current comparisons require the current rubric, exactly {EXPECTED_JEV_MODEL}, and a
          capture from the last 14 days. Older captures remain historical.
        </p>
      </section>

      <section className="pt-10">
        <SectionHeading title="Questions Jev answers" meta="6 kinds" className="border-b" />
        <DataTable columns={["Question", "What Jev is asked"]} className="min-w-0">
          <DataRow>
            <RowHeader className="w-48 max-sm:w-32">Each price</RowHeader>
            <DataCell>
              What is this amount for this plan: a flat or per-seat price billed monthly or
              annually, a usage rate, an add-on, a free plan, a custom quote, or not this
              plan&apos;s price?
            </DataCell>
          </DataRow>
          <DataRow>
            <RowHeader className="w-48 max-sm:w-32">Each feature row</RowHeader>
            <DataCell>Does the page state these values of this feature for these plans?</DataCell>
          </DataRow>
          {JEV_CHOICE_KEYS.map((key) => (
            <DataRow key={key}>
              <RowHeader className="w-48 max-sm:w-32">
                {PRICING_CHOICE_CATALOG[key].label}
              </RowHeader>
              <DataCell>
                <p>{PRICING_CHOICE_CATALOG[key].question}</p>
                <Definitions
                  items={Object.entries(PRICING_CHOICE_CATALOG[key].options).map(
                    ([option, description]) => ({
                      key: option,
                      term: formatToken(option),
                      detail: description,
                    }),
                  )}
                />
              </DataCell>
            </DataRow>
          ))}
        </DataTable>
      </section>

      <section className="pt-10">
        <SectionHeading title="Derived fields" meta="No Jev question" />
        <DataTable columns={["Field", "Rule"]} className="min-w-0">
          <DataRow>
            <RowHeader className="w-48 max-sm:w-32">
              {PRICING_CHOICE_CATALOG.price_disclosure.label}
            </RowHeader>
            <DataCell>{PRICING_CHOICE_CATALOG.price_disclosure.question}</DataCell>
          </DataRow>
          {Object.entries(PRICING_SIGNAL_CATALOG)
            .filter(([, entry]) => entry.source === "derived")
            .map(([key, entry]) => (
              <DataRow key={key}>
                <RowHeader className="w-48 max-sm:w-32">{entry.label}</RowHeader>
                <DataCell>{entry.question}</DataCell>
              </DataRow>
            ))}
        </DataTable>
      </section>

      <section className="pt-10">
        <SectionHeading title="Monetization numbers" meta="Computed, no Jev question" />
        <DataTable columns={["Number", "How it is computed"]} className="min-w-0">
          {MONETIZATION_NUMBERS.map(([label, rule]) => (
            <DataRow key={label}>
              <RowHeader className="w-48 max-sm:w-32">{label}</RowHeader>
              <DataCell>{rule}</DataCell>
            </DataRow>
          ))}
        </DataTable>
      </section>
    </PageShell>
  );
}

const MONETIZATION_NUMBERS = [
  [
    "Annual discount",
    "For each plan with both a monthly-billed and an annual-billed price of the same kind: one minus the annual monthly equivalent over the monthly price, plus the median across plans.",
  ],
  [
    "Entry price and ladder",
    "The monthly price of each paid plan (the annual monthly equivalent when a plan has no monthly price), sorted, and the ratio of the top tier to the entry tier. Shown only when all tiers share one currency.",
  ],
  [
    "Included unit price",
    "A plan's monthly price divided by the absolute quantity a verified feature row includes of the metered unit, per unit and per 1,000. Relative values such as 10x and unlimited are skipped.",
  ],
  [
    "Overage markup",
    "A verified usage rate per unit divided by the included unit price of its plan, or of the cheapest tier when the rate applies to all plans. Shown only when units and currency match.",
  ],
] as const;

const prose =
  "grid max-w-prose gap-4 pt-9 text-base/7 text-gray-11 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:text-foreground [&_h2:first-child]:mt-0 [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-2 [&_ul]:pl-5";
