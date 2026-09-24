import { EXPECTED_JEV_MODEL, MAX_CAPTURE_AGE_MS } from "@my-better-t-app/api/pricing-facts";
import { PRICING_INTELLIGENCE_RUBRIC_ID } from "@my-better-t-app/api/pricing-intelligence";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { IntelligenceProfile } from "@/components/intelligence-profile";
import { NumericPricesPanel } from "@/components/numeric-prices";
import {
  BackLink,
  Definitions,
  Lede,
  LiveDot,
  PageHeader,
  PageShell,
  StatePage,
} from "@/components/page";
import { PricingFactsPanel } from "@/components/pricing-facts";
import { RelativeTime } from "@/components/relative-time";
import { formatStamp, isFresh, toDate } from "@/lib/time";
import { parseDirectoryFilter } from "@/lib/directory-filter";
import { displayUrl, serverUrl } from "@/lib/url";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/pages/$slug")({
  component: PublicPageProfile,
  validateSearch: parseDirectoryFilter,
});

function PublicPageProfile() {
  const { slug } = Route.useParams();
  const filter = Route.useSearch();
  const page = useQuery(orpc.directory.getBySlug.queryOptions({ input: { slug } }));
  if (page.isLoading) return <StatePage loading text="Loading page record…" />;
  if (!page.data) return <StatePage text="This pricing page is not in the public index." />;
  const item = page.data;
  const category = item.choices.find((choice) => choice.key === "product_category")?.choice;
  const cohort = filter.cohort ?? (category ? `category:${category}` : undefined);
  const age = Date.now() - toDate(item.scannedAt).getTime();
  const excluded =
    item.rubricId !== PRICING_INTELLIGENCE_RUBRIC_ID ||
    item.model !== EXPECTED_JEV_MODEL ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > MAX_CAPTURE_AGE_MS;
  return (
    <PageShell>
      <BackLink to="/" search={filter}>
        Directory
      </BackLink>
      <PageHeader
        eyebrow="Pricing page record"
        title={item.normalizedDomain}
        aside={
          <p className="flex w-fit items-center gap-2.5 border bg-card px-3 py-2 text-muted-foreground md:justify-self-end">
            <LiveDot live={isFresh(item.scannedAt)} />
            Latest capture
            <RelativeTime className="font-mono text-xs text-foreground" value={item.scannedAt} />
          </p>
        }
      >
        {/* What the page says about itself, from its own HTML description. */}
        {item.description ? <Lede className="mt-4">{item.description}</Lede> : null}
        <a
          className="mt-4 inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          href={item.canonicalUrl}
          target="_blank"
          rel="noreferrer"
        >
          {displayUrl(item.canonicalUrl)}
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </PageHeader>
      <div className="grid gap-3 pt-5">
        <p className="max-w-[75ch] text-muted-foreground">
          This record describes terms found on the captured pricing page. Missing disclosure does
          not establish that a product lacks a feature.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <Link to="/benchmarks" search={{ cohort }}>
            Compare category practices
          </Link>
          {item.sourceUrl ? (
            <a
              href={serverUrl(item.sourceUrl)}
              target="_blank"
              rel="noreferrer"
              title={formatStamp(item.scannedAt)}
            >
              View archived source
            </a>
          ) : null}
        </div>
      </div>
      {excluded ? (
        <p className="mt-6 border border-warning-6 bg-warning-2 px-4 py-3 text-warning-11">
          Historical record. This capture is excluded from current comparisons. Current comparisons
          require the current rubric, {EXPECTED_JEV_MODEL}, and a capture from the last 14 days.
        </p>
      ) : null}
      <NumericPricesPanel prices={item.numericPrices} sourceUrl={item.sourceUrl} />
      <PricingFactsPanel facts={item.pricingFacts} sourceUrl={item.sourceUrl} />
      <IntelligenceProfile
        rubricId={item.rubricId}
        choices={item.choices}
        signals={item.signals}
        tags={item.tags}
      >
        <Definitions
          items={[
            { term: "Captured", detail: formatStamp(item.scannedAt) },
            { term: "Rubric", detail: item.rubricId },
            { term: "Model", detail: item.model },
            { term: "Browser", detail: item.browserEngine },
          ]}
        />
      </IntelligenceProfile>
    </PageShell>
  );
}
