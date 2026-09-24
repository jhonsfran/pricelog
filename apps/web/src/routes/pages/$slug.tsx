import { LayerTitle } from "@/components/layer-title";
import { EXPECTED_JEV_MODEL, MAX_CAPTURE_AGE_MS } from "@my-better-t-app/api/pricing-facts";
import { PRICING_INTELLIGENCE_RUBRIC_ID } from "@my-better-t-app/api/pricing-intelligence";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { ENV } from "@/env.public";
import { IntelligenceProfile } from "@/components/intelligence-profile";
import { NumericPricesPanel } from "@/components/numeric-prices";
import { PricingFactsPanel } from "@/components/pricing-facts";
import { RelativeTime } from "@/components/relative-time";
import { formatStamp, isFresh, toDate } from "@/lib/time";
import { parseDirectoryFilter } from "@/lib/directory-filter";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/pages/$slug")({
  component: PublicPageProfile,
  validateSearch: parseDirectoryFilter,
});

function PublicPageProfile() {
  const { slug } = Route.useParams();
  const filter = Route.useSearch();
  const page = useQuery(orpc.directory.getBySlug.queryOptions({ input: { slug } }));
  if (page.isLoading) return <StatePage text="Loading page record…" />;
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
    <main className="profile-shell">
      <Link className="back-link" to="/" search={filter}>
        <ArrowLeft size={15} />
        Directory
      </Link>
      <section className="profile-heading">
        <div>
          <p className="eyebrow">Pricing page record</p>
          <h1>
            <LayerTitle>{item.displayName ?? item.normalizedDomain}</LayerTitle>
          </h1>
          <a href={item.canonicalUrl} target="_blank" rel="noreferrer">
            {item.normalizedDomain}
            <ExternalLink size={14} />
          </a>
        </div>
        <p className="capture-stamp">
          <span className="live-dot" data-live={isFresh(item.scannedAt)} aria-hidden="true" />
          <span>Latest capture</span>
          <RelativeTime value={item.scannedAt} />
        </p>
      </section>
      <div className="profile-summary">
        <p>
          This record describes terms found on the captured pricing page. Missing disclosure does
          not establish that a product lacks a feature.
        </p>
        <div className="profile-source-links">
          <Link to="/benchmarks" search={{ cohort }}>
            Compare category practices
          </Link>
          {item.sourceUrl ? (
            <a
              href={`${ENV.VITE_SERVER_URL.replace(/\/$/, "")}${item.sourceUrl}`}
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
        <p className="methodology-note">
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
        <dl className="definition-list">
          <div>
            <dt>Captured</dt>
            <dd>{formatStamp(item.scannedAt)}</dd>
          </div>
          <div>
            <dt>Rubric</dt>
            <dd>{item.rubricId}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{item.model}</dd>
          </div>
          <div>
            <dt>Browser</dt>
            <dd>{item.browserEngine}</dd>
          </div>
        </dl>
      </IntelligenceProfile>
    </main>
  );
}

function StatePage({ text }: { text: string }) {
  return (
    <main className="state-page">
      <p>{text}</p>
      <Link to="/">Return to directory</Link>
    </main>
  );
}
