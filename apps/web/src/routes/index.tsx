import { CategoryPicker } from "@/components/category-picker";
import { prioritizeTags } from "@/components/intelligence-profile";
import { formatToken } from "@/lib/format";
import {
  BackLink,
  Lede,
  Notice,
  PageHeader,
  PageShell,
  RecordIdentity,
  RowArrow,
  RowLink,
  SectionHeading,
  Tag,
} from "@/components/page";
import { RelativeTime } from "@/components/relative-time";
import { staggerDelay } from "@/lib/animation";
import { parseComparisonSearch } from "@/lib/comparison-search";
import {
  describeDirectoryFilter,
  hasDirectoryFilter,
  parseDirectoryFilter,
} from "@/lib/directory-filter";
import { orpc } from "@/utils/orpc";
import { AI_APPLICATIONS_COHORT } from "@my-better-t-app/api/benchmark";
import type { DescendingTimestampCursor } from "@my-better-t-app/api/pagination";
import { Button, buttonVariants } from "@my-better-t-app/ui/components/button";
import { Field, FieldLabel } from "@my-better-t-app/ui/components/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@my-better-t-app/ui/components/input-group";
import { Kbd } from "@my-better-t-app/ui/components/kbd";
import { Skeleton } from "@my-better-t-app/ui/components/skeleton";
import { cn } from "@my-better-t-app/ui/lib/utils";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Search, X } from "lucide-react";
import { useDeferredValue, useEffect, useRef, useState } from "react";

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
    <PageShell>
      {showingExamples ? (
        <>
          <BackLink
            to="/benchmarks"
            search={parseComparisonSearch({ cohort: filter.cohort, topic: filter.choiceKey })}
          >
            Compare pricing
          </BackLink>
          <PageHeader eyebrow="Pages behind an answer" title="Pricing page examples" />
        </>
      ) : (
        <PageHeader
          eyebrow="Pricing research for AI product teams"
          title="See how AI pricing changes."
          className="md:items-center"
          aside={
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                navigate({ to: "/benchmarks", search: { cohort: comparisonCategory } });
              }}
            >
              <CategoryPicker
                value={comparisonCategory}
                onChange={(cohort) =>
                  navigate({ search: { ...filter, cohort }, resetScroll: false })
                }
              />
              <Button type="submit" size="lg">
                Compare pricing practices <ArrowRight data-icon="inline-end" />
              </Button>
              <p>
                <Link to="/changes" search={{ cohort: comparisonCategory }}>
                  See weekly changes
                </Link>
              </p>
            </form>
          }
        >
          <Lede className="mt-5">
            Compare how AI products charge. Dated versions of their pricing pages show what changed
            over time.
          </Lede>
        </PageHeader>
      )}
      <section className="pt-8" aria-labelledby="directory-title">
        <SectionHeading
          id="directory-title"
          title={filtered ? "Matching pricing pages" : "Browse pricing pages"}
          meta={directory.isLoading ? "—" : `${total} pages`}
        />
        {filtered ? (
          <div className="flex flex-wrap items-center gap-2 pt-1 pb-3.5">
            {describeDirectoryFilter(filter).map((chip) => (
              <Link
                key={chip.id}
                to="/"
                search={chip.without}
                aria-label={`Remove filter ${chip.kind}: ${chip.label}`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "gap-2 border-brand-7 bg-transparent hover:border-brand-8 hover:bg-brand-3",
                )}
              >
                <small className="kicker text-brand-11">{chip.kind}</small>
                {chip.label}
                <X aria-hidden="true" data-icon="inline-end" className="text-muted-foreground" />
              </Link>
            ))}
            <Link
              to="/"
              search={{}}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "text-muted-foreground",
              )}
            >
              Clear all
            </Link>
          </div>
        ) : null}
        <Field>
          <FieldLabel className="sr-only" htmlFor="directory-search">
            Search pricing pages
          </FieldLabel>
          {/* A rule, not a box: the search belongs to the list under it. */}
          <InputGroup className="h-14 border-0 border-b border-input bg-transparent has-[[data-slot=input-group-control]:focus-visible]:border-foreground has-[[data-slot=input-group-control]:focus-visible]:ring-0">
            <InputGroupAddon className="pl-0">
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              id="directory-search"
              ref={searchInput}
              type="search"
              className="text-base md:text-base"
              placeholder="Search companies or domains"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <InputGroupAddon align="inline-end">
              <Kbd
                aria-hidden="true"
                className="transition-opacity group-focus-within/input-group:opacity-0"
              >
                /
              </Kbd>
            </InputGroupAddon>
          </InputGroup>
        </Field>
        <div className="mt-4" aria-live="polite">
          <div className={`kicker h-11 border-b text-muted-foreground max-md:hidden ${row}`}>
            <span>Page</span>
            <span>Category</span>
            <span>Latest capture</span>
            <span aria-hidden="true" />
          </div>
          {directory.isLoading ? (
            <DirectorySkeleton />
          ) : directory.isError ? (
            <Notice>The directory is not available.</Notice>
          ) : items.length === 0 ? (
            <Notice>
              {search || filtered
                ? "No pages match these filters."
                : "No pricing pages have been indexed yet."}
            </Notice>
          ) : (
            items.map((item, index) => (
              <RowLink
                className={row}
                key={item.id}
                to="/pages/$slug"
                params={{ slug: item.slug }}
                search={filter}
                style={{ animationDelay: staggerDelay(index) }}
              >
                <RecordIdentity name={item.normalizedDomain} description={item.description}>
                  {item.snapshot?.status === "collected" && item.snapshot.offers.length > 0 ? (
                    <Tag>{item.snapshot.offers.length} verified offers</Tag>
                  ) : null}
                  {item.numericPrices?.status === "collected" &&
                  item.numericPrices.offers.length > 0 ? (
                    <Tag>{item.numericPrices.offers.length} listed prices</Tag>
                  ) : null}
                  {item.tags.length > 0 ? (
                    <span className="flex flex-wrap gap-1.5">
                      {prioritizeTags(item.tags)
                        .slice(0, 3)
                        .map((tag) => (
                          <Tag key={tag}>{formatToken(tag)}</Tag>
                        ))}
                    </span>
                  ) : null}
                </RecordIdentity>
                <span className="text-gray-11 max-md:hidden">
                  {formatToken(
                    item.choices.find((choice) => choice.key === "product_category")?.choice ??
                      "unclassified",
                  )}
                </span>
                <RelativeTime
                  className="font-mono text-2xs text-muted-foreground max-md:hidden"
                  value={item.scannedAt}
                />
                <RowArrow />
              </RowLink>
            ))
          )}
        </div>
        {directory.hasNextPage ? (
          <Button
            className="mx-auto mt-6 flex"
            variant="outline"
            disabled={directory.isFetchingNextPage}
            onClick={() => directory.fetchNextPage()}
          >
            {directory.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        ) : null}
      </section>
    </PageShell>
  );
}

const row =
  "grid grid-cols-[minmax(0,1fr)_8.25rem_9.5rem_1.75rem] items-center gap-6 max-md:grid-cols-[minmax(0,1fr)_auto]";

/** Holds the row rhythm while the index loads so results never shift the page. */
function DirectorySkeleton() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => (
        <div className="grid min-h-20 content-center gap-2 border-b border-gray-4" key={index}>
          <Skeleton className="h-2.5" style={{ width: `${34 + ((index * 13) % 26)}%` }} />
          <Skeleton className="h-2 w-[18%]" />
        </div>
      ))}
    </div>
  );
}
