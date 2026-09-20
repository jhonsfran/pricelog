import type { DescendingTimestampCursor } from "@my-better-t-app/api/pagination";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { formatToken, prioritizeTags } from "@/components/intelligence-profile";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/")({ component: DirectoryPage });

function DirectoryPage() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim();
  const directory = useInfiniteQuery(
    orpc.directory.list.infiniteOptions({
      input: (cursor: DescendingTimestampCursor | null) => ({
        ...(normalizedSearch ? { search: normalizedSearch } : {}),
        ...(cursor ? { cursor } : {}),
        limit: 50,
      }),
      initialPageParam: null as DescendingTimestampCursor | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }),
  );
  const items = directory.data?.pages.flatMap((result) => result.items) ?? [];

  return (
    <main className="directory-shell">
      <section className="directory-hero">
        <div>
          <p className="eyebrow">THE OPEN PRICING INDEX</p>
          <h1>PRICELOG</h1>
        </div>
        <p className="hero-copy">
          Commercial pricing intelligence for pricing teams and founders. Each page is captured,
          classified, and scored against the same question set every week.
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
                  {item.tags.length > 0 && (
                    <span className="directory-tags">
                      {prioritizeTags(item.tags)
                        .slice(0, 3)
                        .map((tag) => (
                          <span key={tag}>{formatToken(tag)}</span>
                        ))}
                    </span>
                  )}
                </span>
                <span className="quality-score">{Math.round(item.overallScore)}</span>
                <span className="scan-date">{formatDate(item.scannedAt)}</span>
                <span className="row-arrow">↗</span>
              </Link>
            ))
          )}
        </div>
        {directory.hasNextPage ? (
          <button
            className="load-more-button"
            disabled={directory.isFetchingNextPage}
            onClick={() => directory.fetchNextPage()}
          >
            {directory.isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        ) : null}
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
