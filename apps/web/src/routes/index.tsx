import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/")({ component: DirectoryPage });

function DirectoryPage() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const directory = useQuery(
    orpc.directory.list.queryOptions({
      input: deferredSearch.trim() ? { search: deferredSearch.trim(), limit: 50 } : { limit: 50 },
    }),
  );
  const items = directory.data?.items ?? [];

  return (
    <main className="directory-shell">
      <section className="directory-hero">
        <div>
          <p className="eyebrow">THE OPEN PRICING INDEX</p>
          <h1>PRICELOG</h1>
        </div>
        <p className="hero-copy">
          A weekly record of how software companies explain what they charge. Each page is captured,
          archived, and scored against the same five questions.
        </p>
      </section>
      <section className="directory-section" aria-labelledby="directory-title">
        <div className="section-kicker">
          <span id="directory-title">PRICING DIRECTORY</span>
          <span>{directory.isLoading ? "—" : `${items.length} PAGES`}</span>
        </div>
        <label className="search-box">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Search pricing pages</span>
          <input
            type="search"
            placeholder="Search companies or domains"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <kbd>/</kbd>
        </label>
        <div className="directory-table" aria-live="polite">
          <div className="directory-head">
            <span>PAGE</span>
            <span>QUALITY</span>
            <span>LAST SCAN</span>
            <span aria-hidden="true" />
          </div>
          {directory.isLoading ? (
            <DirectoryMessage text="Reading the index…" />
          ) : directory.isError ? (
            <DirectoryMessage text="The directory is not available." />
          ) : items.length === 0 ? (
            <DirectoryMessage
              text={
                search ? "No pages match this search." : "No pricing pages have been indexed yet."
              }
            />
          ) : (
            items.map((item, index) => (
              <Link
                className="directory-row"
                key={item.id}
                to="/pages/$slug"
                params={{ slug: item.slug }}
                style={{ animationDelay: `${index * 35}ms` }}
              >
                <span className="page-identity">
                  <strong>{item.displayName ?? item.normalizedDomain}</strong>
                  <small>{item.normalizedDomain}</small>
                </span>
                <span className="quality-score">{Math.round(item.overallScore)}</span>
                <span className="scan-date">{formatDate(item.scannedAt)}</span>
                <span className="row-arrow">↗</span>
              </Link>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function DirectoryMessage({ text }: { text: string }) {
  return <div className="directory-message">{text}</div>;
}
function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "2-digit" })
    .format(new Date(value))
    .toUpperCase();
}
