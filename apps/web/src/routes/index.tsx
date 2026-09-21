import type { DescendingTimestampCursor } from "@my-better-t-app/api/pagination";
import { Button } from "@my-better-t-app/ui/components/button";
import { Field, FieldLabel } from "@my-better-t-app/ui/components/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@my-better-t-app/ui/components/input-group";
import { Skeleton } from "@my-better-t-app/ui/components/skeleton";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { type CSSProperties, useDeferredValue, useEffect, useRef, useState } from "react";
import { formatToken, prioritizeTags } from "@/components/intelligence-profile";
import { fillRatio, scoreBand, staggerDelay } from "@/lib/score";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/")({ component: DirectoryPage });

function DirectoryPage() {
  const [search, setSearch] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim();

  // The `/` hint in the search box has to be real, or it is a lie the
  // interface tells every keyboard user who tries it.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        searchInput.current?.focus();
      }
      if (event.key === "Escape" && target === searchInput.current) {
        setSearch("");
        searchInput.current?.blur();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
        <Field className="search-field">
          <FieldLabel className="sr-only" htmlFor="directory-search">
            Search pricing pages
          </FieldLabel>
          <InputGroup className="search-box">
            <InputGroupAddon>
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              id="directory-search"
              ref={searchInput}
              type="search"
              placeholder="Search companies or domains"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <InputGroupAddon align="inline-end">
              <kbd aria-hidden="true">/</kbd>
            </InputGroupAddon>
          </InputGroup>
        </Field>
        <div className="directory-table" aria-live="polite">
          <div className="directory-head">
            <span>PAGE</span>
            <span>QUALITY</span>
            <span>LAST SCAN</span>
            <span aria-hidden="true" />
          </div>
          {directory.isLoading ? (
            <DirectorySkeleton />
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
                className="directory-row row-enter"
                key={item.id}
                to="/pages/$slug"
                params={{ slug: item.slug }}
                data-band={scoreBand(item.overallScore)}
                style={{ "--enter-delay": staggerDelay(index) } as CSSProperties}
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
                {/* The number alone makes 38 and 84 look identical at a glance.
                    The meter gives the column a shape you can scan. */}
                <span className="quality-cell">
                  <span className="quality-score">{Math.round(item.overallScore)}</span>
                  <span className="quality-meter" aria-hidden="true">
                    <span
                      className="quality-fill"
                      style={
                        {
                          "--fill": fillRatio(item.overallScore),
                          "--fill-delay": staggerDelay(index),
                        } as CSSProperties
                      }
                    />
                  </span>
                </span>
                <span className="scan-date">{formatDate(item.scannedAt)}</span>
                <span className="row-arrow" aria-hidden="true">
                  ↗
                </span>
              </Link>
            ))
          )}
        </div>
        {directory.hasNextPage ? (
          <Button
            className="load-more-button"
            variant="outline"
            disabled={directory.isFetchingNextPage}
            onClick={() => directory.fetchNextPage()}
          >
            {directory.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        ) : null}
      </section>
    </main>
  );
}

/** Holds the row rhythm while the index loads so results never shift the page. */
function DirectorySkeleton() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => (
        <div className="skeleton-row" key={index}>
          <Skeleton className="skeleton-bar" style={{ width: `${34 + ((index * 13) % 26)}%` }} />
          <Skeleton className="skeleton-bar h-2" style={{ width: "18%" }} />
        </div>
      ))}
    </div>
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
