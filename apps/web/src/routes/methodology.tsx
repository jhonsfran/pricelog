import { EXPECTED_JEV_MODEL } from "@my-better-t-app/api/pricing-facts";
import {
  CHOICE_CONFIDENCE_THRESHOLD,
  PRICING_CHOICE_CATALOG,
  PRICING_CHOICE_GROUPS,
  PRICING_SIGNAL_CATALOG,
  PRICING_PAGE_SCOPE,
  TAG_PROBABILITY_THRESHOLD,
  NOT_ESTABLISHED_PROBABILITY_THRESHOLD,
} from "@my-better-t-app/api/pricing-intelligence";
import { PROFILE_CHOICE_KEYS, PROFILE_FLAG_KEYS } from "@my-better-t-app/api/pricing-snapshot";
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
          Chromium saves rendered HTML, Markdown, and a full-page screenshot. The capture dismisses
          known cookie panels and keeps visible price labels from accessible page content. The
          archive is the evidence for each scan.
        </p>
        <h2>How a claim becomes public</h2>
        <p>
          Browser Run reads the captured HTML and proposes a structured draft. Jev then answers
          questions against trimmed Markdown from that same capture. The draft is never Jev's
          source. Each question checks one proposed claim about a current offer or the page profile.
        </p>
        <ul>
          <li>
            Page choices need a matching Jev answer at {CHOICE_CONFIDENCE_THRESHOLD} confidence.
          </li>
          <li>Positive yes/no claims need at least {TAG_PROBABILITY_THRESHOLD} probability.</li>
          <li>Negative claims need at most {NOT_ESTABLISHED_PROBABILITY_THRESHOLD} probability.</li>
          <li>
            Prices need a verified offer, exact visible label, role, period, unit, and matching
            numeric value.
          </li>
          <li>Feature availability uses a closed set of answers for each offer.</li>
        </ul>
        <p>
          The public page shows accepted claims. The page owner sees claims that need review. If
          extraction has no valid draft, the commercial snapshot is unavailable and no Jev check
          runs for it. These thresholds are acceptance rules, not measured accuracy.
        </p>
        <h2>Source and comparisons</h2>
        <p>{PRICING_PAGE_SCOPE}</p>
        <p>
          Current comparisons require the current rubric, exactly {EXPECTED_JEV_MODEL}, and a
          capture from the last 14 days. Older captures remain historical. The new offer snapshot
          does not feed the old numeric benchmark until a compatible calculation is defined.
        </p>
      </section>

      <section className="pt-10">
        <SectionHeading
          title="Page choices"
          meta={`${PROFILE_CHOICE_KEYS.length} questions`}
          className="border-b"
        />
        {PRICING_CHOICE_GROUPS.filter((group) => group.key !== "practices").map((group) => (
          <div key={group.key} className="pt-6">
            <h4 className="text-sm tracking-normal">{group.label}</h4>
            {PROFILE_CHOICE_KEYS.filter(
              (key) => PRICING_CHOICE_CATALOG[key].group === group.key,
            ).map((key) => {
              const entry = PRICING_CHOICE_CATALOG[key];
              return (
                <article className="grid gap-3 border-b border-gray-4 py-5" key={key}>
                  <h3 className="text-base">{entry.label}</h3>
                  <p>{entry.question}</p>
                  <Definitions
                    items={Object.entries(entry.options).map(([option, description]) => ({
                      key: option,
                      term: formatToken(option),
                      detail: description,
                    }))}
                  />
                </article>
              );
            })}
          </div>
        ))}
      </section>

      <section className="pt-10">
        <SectionHeading title="Page flags" meta={`${PROFILE_FLAG_KEYS.length} questions`} />
        <DataTable columns={["Flag", "Question"]} className="min-w-0">
          {PROFILE_FLAG_KEYS.map((key) => {
            const entry = PRICING_SIGNAL_CATALOG[key];
            return (
              <DataRow key={key}>
                <RowHeader className="w-48 max-sm:w-32">{entry.label}</RowHeader>
                <DataCell>{entry.question}</DataCell>
              </DataRow>
            );
          })}
        </DataTable>
      </section>
    </PageShell>
  );
}

const prose =
  "grid max-w-prose gap-4 pt-9 text-base/7 text-gray-11 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:text-foreground [&_h2:first-child]:mt-0 [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-2 [&_ul]:pl-5";
