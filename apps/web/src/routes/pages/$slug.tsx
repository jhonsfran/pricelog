import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { ENV } from "@/env.public";
import { IntelligenceProfile } from "@/components/intelligence-profile";
import { NumericPricesPanel } from "@/components/numeric-prices";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/pages/$slug")({ component: PublicPageProfile });

function PublicPageProfile() {
  const { slug } = Route.useParams();
  const page = useQuery(orpc.directory.getBySlug.queryOptions({ input: { slug } }));
  if (page.isLoading) return <StatePage text="Loading page record…" />;
  if (!page.data) return <StatePage text="This pricing page is not in the public index." />;
  const item = page.data;
  return (
    <main className="profile-shell">
      <Link className="back-link" to="/">
        <ArrowLeft size={15} />
        Directory
      </Link>
      <section className="profile-heading">
        <div>
          <p className="eyebrow">PRICING PAGE RECORD</p>
          <h1>{item.displayName ?? item.normalizedDomain}</h1>
          <a href={item.canonicalUrl} target="_blank" rel="noreferrer">
            {item.normalizedDomain}
            <ExternalLink size={14} />
          </a>
        </div>
      </section>
      <section className="profile-grid">
        <div className="profile-card profile-card-main">
          <div className="section-kicker">
            <span>PUBLISHED PRICING PRACTICES</span>
          </div>
          <p>
            This record describes terms found on the captured pricing page. Missing disclosure does
            not establish that a product lacks a feature.
          </p>
          <Link to="/benchmarks">Compare category practices</Link>
          {item.sourceUrl ? (
            <p>
              <a
                href={`${ENV.VITE_SERVER_URL.replace(/\/$/, "")}${item.sourceUrl}`}
                target="_blank"
                rel="noreferrer"
              >
                Read the archived source captured {formatDate(item.scannedAt)}
              </a>
            </p>
          ) : null}
        </div>
        <aside className="profile-card profile-facts">
          <div>
            <span>CAPTURED</span>
            <strong>{formatDate(item.scannedAt)}</strong>
          </div>
          <div>
            <span>RUBRIC</span>
            <strong>{item.rubricId}</strong>
          </div>
          <div>
            <span>MODEL</span>
            <strong>{item.model}</strong>
          </div>
          <div>
            <span>BROWSER</span>
            <strong>{item.browserEngine}</strong>
          </div>
        </aside>
      </section>
      <NumericPricesPanel prices={item.numericPrices} sourceUrl={item.sourceUrl} />
      <IntelligenceProfile
        rubricId={item.rubricId}
        choices={item.choices}
        signals={item.signals}
        tags={item.tags}
      />
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
function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}
