import { EXPECTED_JEV_MODEL } from "@my-better-t-app/api/pricing-facts";
import {
  CHOICE_CONFIDENCE_THRESHOLD,
  PRICING_CHOICE_CATALOG,
  PRICING_SIGNAL_CATALOG,
  PRICING_PAGE_SCOPE,
  TAG_PROBABILITY_THRESHOLD,
} from "@my-better-t-app/api/pricing-intelligence";
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
            Jev answers one yes/no question per price (plan, amount, period, billing, kind) and one
            per feature row. A claim publishes at {TAG_PROBABILITY_THRESHOLD} probability or more;
            anything else goes to review.
          </li>
          <li>
            Jev also classifies the product category, accepted at {CHOICE_CONFIDENCE_THRESHOLD}{" "}
            confidence, and whether the page offers a free trial.
          </li>
          <li>Every other profile field is derived from the verified prices and features.</li>
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
        <SectionHeading title="Questions Jev answers" meta="4 kinds" className="border-b" />
        <DataTable columns={["Question", "What Jev is asked"]} className="min-w-0">
          <DataRow>
            <RowHeader className="w-48 max-sm:w-32">Each price</RowHeader>
            <DataCell>
              Does the page offer this plan at this price, for this period and billing term, as this
              kind of price (flat, per seat, usage, add-on, free or custom quote)?
            </DataCell>
          </DataRow>
          <DataRow>
            <RowHeader className="w-48 max-sm:w-32">Each feature row</RowHeader>
            <DataCell>Does the page state these values of this feature for these plans?</DataCell>
          </DataRow>
          <DataRow>
            <RowHeader className="w-48 max-sm:w-32">
              {PRICING_SIGNAL_CATALOG.has_free_trial.label}
            </RowHeader>
            <DataCell>{PRICING_SIGNAL_CATALOG.has_free_trial.question}</DataCell>
          </DataRow>
          <DataRow>
            <RowHeader className="w-48 max-sm:w-32">
              {PRICING_CHOICE_CATALOG.product_category.label}
            </RowHeader>
            <DataCell>
              <p>{PRICING_CHOICE_CATALOG.product_category.question}</p>
              <Definitions
                items={Object.entries(PRICING_CHOICE_CATALOG.product_category.options).map(
                  ([option, description]) => ({
                    key: option,
                    term: formatToken(option),
                    detail: description,
                  }),
                )}
              />
            </DataCell>
          </DataRow>
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
    </PageShell>
  );
}

const prose =
  "grid max-w-prose gap-4 pt-9 text-base/7 text-gray-11 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:text-foreground [&_h2:first-child]:mt-0 [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-2 [&_ul]:pl-5";
