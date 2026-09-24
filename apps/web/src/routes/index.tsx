import { CategoryPicker } from "@/components/category-picker";
import { formatToken, prioritizeTags } from "@/components/intelligence-profile";
import { LayerTitle } from "@/components/layer-title";
import { RelativeTime } from "@/components/relative-time";
import { staggerDelay } from "@/lib/animation";
import { parseComparisonSearch } from "@/lib/comparison-search";
import {
  describeDirectoryFilter,
  hasDirectoryFilter,
  parseDirectoryFilter,
} from "@/lib/directory-filter";
import { orpc } from "@/utils/orpc";
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
import { ArrowRight, Search, X } from "lucide-react";
import { type CSSProperties, useDeferredValue, useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  component: DirectoryPage,
  validateSearch: parseDirectoryFilter,
});

function DirectoryPage() {
  const filter = Route.useSearch();
  const navigate = Route.useNavigate();
  const comparisonCategory = filter.cohort ?? AI_APPLICATIONS_COHORT;
  const filtered = hasDirectoryFilter(filter);
  const showingExamples = Boolean(filter.signal || filter.choiceKey);
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
        ...filter,
        ...(cursor ? { cursor } : {}),
        limit: 50,
      }),
      initialPageParam: null as DescendingTimestampCursor | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }),
  );
  const items = directory.data?.pages.flatMap((result) => result.items) ?? [];
  // The server counts the whole filter; items is only what has been paged in.
  const total = directory.data?.pages[0]?.total ?? 0;
  return (
    <main className="directory-shell">
      {showingExamples ? (
        <section className="directory-results-heading">
          <Link
            className="back-link"
            to="/benchmarks"
            search={parseComparisonSearch({ cohort: filter.cohort, topic: filter.choiceKey })}
          >
            Compare pricing
          </Link>
          <h1>
            <LayerTitle>Pricing page examples</LayerTitle>
          </h1>
        </section>
      ) : (
        <section className="directory-hero">
          <div>
            <p className="eyebrow">Pricing research for AI product teams</p>
            <h1>
              <LayerTitle depth={3}>See how AI pricing changes.</LayerTitle>
            </h1>
            <p className="hero-copy">
              Compare how AI products charge. Dated versions of their pricing pages show what
              changed over time.
            </p>
          </div>
          <form
            className="comparison-start"
            onSubmit={(event) => {
              event.preventDefault();
              navigate({ to: "/benchmarks", search: { cohort: comparisonCategory } });
            }}
          >
            <CategoryPicker
              value={comparisonCategory}
              onChange={(cohort) => navigate({ search: { ...filter, cohort }, resetScroll: false })}
            />
            <Button type="submit">
              Compare pricing practices <ArrowRight data-icon="inline-end" />
            </Button>
            <Link to="/changes" search={{ cohort: comparisonCategory }}>
              See weekly changes
            </Link>
          </form>
        </section>
      )}
      <section className="directory-section" aria-labelledby="directory-title">
        <div className="section-kicker">
          <span id="directory-title">
            {filtered ? "MATCHING PRICING PAGES" : "BROWSE PRICING PAGES"}
          </span>
          <span>{directory.isLoading ? "—" : `${total} PAGES`}</span>
        </div>
        {filtered ? (
          <div className="filter-bar">
            {describeDirectoryFilter(filter).map((chip) => (
              <Link
                className="filter-chip"
                key={chip.id}
                to="/"
                search={chip.without}
                aria-label={`Remove filter ${chip.kind}: ${chip.label}`}
              >
                <small>{chip.kind}</small>
                {chip.label}
                <X size={13} aria-hidden="true" />
              </Link>
            ))}
            <Link className="filter-clear" to="/" search={{}}>
              Clear all
            </Link>
          </div>
        ) : null}
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
            <span>CATEGORY</span>
            <span>LATEST CAPTURE</span>
            <span aria-hidden="true" />
          </div>
          {directory.isLoading ? (
            <DirectorySkeleton />
          ) : directory.isError ? (
            <DirectoryMessage text="The directory is not available." />
          ) : items.length === 0 ? (
            <DirectoryMessage
              text={
                search || filtered
                  ? "No pages match these filters."
                  : "No pricing pages have been indexed yet."
              }
            />
          ) : (
            items.map((item, index) => (
              <Link
                className="directory-row row-enter"
                key={item.id}
                to="/pages/$slug"
                params={{ slug: item.slug }}
                search={filter}
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
                <span className="practice-cell">
                  {formatToken(
                    item.choices.find((choice) => choice.key === "product_category")?.choice ??
                      "unclassified",
                  )}
                </span>
                <RelativeTime className="scan-date" value={item.scannedAt} />
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
import { AI_APPLICATIONS_COHORT } from "@my-better-t-app/api/benchmark";
