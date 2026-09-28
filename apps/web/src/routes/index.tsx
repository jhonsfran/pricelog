import { ChipRow, chipClass } from "@/components/chips";
import { CountUp } from "@/components/count-up";
import { Monogram } from "@/components/monogram";
import {
  BackLink,
  LiveDot,
  Notice,
  PageHeader,
  PageShell,
  RowArrow,
  RowLink,
} from "@/components/page";
import { PriceLadder } from "@/components/price-ladder";
import { PriceTape, type TapeEntry } from "@/components/price-tape";
import { RecordStack, type StackRecord } from "@/components/record-stack";
import { RelativeTime } from "@/components/relative-time";
import { staggerDelay } from "@/lib/animation";
import { CATEGORY_OPTIONS, parseComparisonSearch } from "@/lib/comparison-search";
import {
  describeDirectoryFilter,
  hasDirectoryFilter,
  parseDirectoryFilter,
  type DirectoryFilter,
} from "@/lib/directory-filter";
import { formatToken } from "@/lib/format";
import { entryLabel, priceLadder } from "@/lib/pricing-display";
import { isFresh } from "@/lib/time";
import { orpc } from "@/utils/orpc";
import { AI_APPLICATIONS_COHORT } from "@pricelog/api/benchmark";
import type { DescendingTimestampCursor } from "@pricelog/api/pagination";
import type { AppRouterClient } from "@pricelog/api/routers/index";
import { Button, buttonVariants } from "@pricelog/ui/components/button";
import { Field, FieldLabel } from "@pricelog/ui/components/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@pricelog/ui/components/input-group";
import { Kbd } from "@pricelog/ui/components/kbd";
import { Skeleton } from "@pricelog/ui/components/skeleton";
import { cn } from "@pricelog/ui/lib/utils";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Search, X } from "lucide-react";
import { useDeferredValue, useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  component: DirectoryPage,
  validateSearch: parseDirectoryFilter,
});

type DirectoryItem = Awaited<ReturnType<AppRouterClient["directory"]["list"]>>["items"][number];

const categoryOf = (item: Pick<DirectoryItem, "choices">) =>
  item.choices.find((choice) => choice.key === "product_category")?.choice;

function DirectoryPage() {
  const filter = Route.useSearch();
  const showingExamples = Boolean(filter.signal || filter.choiceKey);
  return (
    <>
      {showingExamples ? (
        <PageShell className="pb-0">
          <BackLink
            to="/benchmarks"
            search={parseComparisonSearch({ cohort: filter.cohort, topic: filter.choiceKey })}
          >
            Compare pricing
          </BackLink>
          <PageHeader eyebrow="Pages behind an answer" title="Pricing page examples" />
        </PageShell>
      ) : (
        <Hero cohort={filter.cohort} />
      )}
      <Directory filter={filter} />
    </>
  );
}

/**
 * The first thing a visitor meets is what the index is for, told as the record it keeps: real
 * captures filed one behind another, and the prices on them running past.
 */
function Hero({ cohort }: { cohort?: string }) {
  const overview = useQuery(orpc.directory.overview.queryOptions());
  // The unfiltered latest captures, whatever the list below is filtered to.
  const latest = useQuery(orpc.directory.list.queryOptions({ input: { limit: 50 } }));
  const items = latest.data?.items ?? [];
  const records: StackRecord[] = items
    .filter((item) => priceLadder(item.snapshot).length >= 2)
    .sort((left, right) => +new Date(right.scannedAt) - +new Date(left.scannedAt))
    .slice(0, 8)
    .map((item) => ({ ...item, category: categoryOf(item) }));
  const stats = overview.data;
  return (
    <>
      <section className="relative isolate overflow-hidden">
        {/* A low brand glow behind the stack, the only light in the room. */}
        <div
          aria-hidden="true"
          className="absolute -top-40 right-[-10%] -z-10 size-[42rem] rounded-full bg-[radial-gradient(closest-side,var(--color-brand-4),transparent)] opacity-60"
        />
        <div className="mx-auto grid w-full max-w-292 items-center gap-12 px-6 pt-12 pb-14 max-sm:px-4 max-sm:pt-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16">
          <div className="min-w-0">
            <p className="kicker flex items-center gap-2.5 text-muted-foreground motion-safe:animate-rise">
              <LiveDot live={stats?.latestScanAt ? isFresh(stats.latestScanAt) : false} />
              The open pricing index for AI products
            </p>
            <h1
              className="mt-5 text-4xl leading-[1.02] font-[650] tracking-[-0.035em] text-balance motion-safe:animate-rise sm:text-5xl lg:text-[3.6rem]"
              style={{ animationDelay: "80ms" }}
            >
              Pricing pages change quietly.
              <span className="block text-gray-10">We keep the record.</span>
            </h1>
            <p
              className="mt-5 max-w-[34rem] text-base/relaxed text-muted-foreground motion-safe:animate-rise md:text-lg/relaxed"
              style={{ animationDelay: "160ms" }}
            >
              Every week Pricelog captures the pricing pages of AI products, checks each price
              against the page, and files every version. See what they charge, and what moved.
            </p>
            <div
              className="mt-7 flex flex-wrap gap-3 motion-safe:animate-rise"
              style={{ animationDelay: "240ms" }}
            >
              <Link
                to="/benchmarks"
                search={cohort ? { cohort } : {}}
                className={buttonVariants({ size: "lg" })}
              >
                Compare pricing <ArrowRight data-icon="inline-end" />
              </Link>
              <Link
                to="/changes"
                search={cohort ? { cohort } : {}}
                className={buttonVariants({ size: "lg", variant: "outline" })}
              >
                This week's changes
              </Link>
            </div>
            <dl
              className="mt-10 grid max-w-lg grid-cols-3 border-t border-gray-5 pt-5 motion-safe:animate-rise"
              style={{ animationDelay: "320ms" }}
            >
              {(
                [
                  ["Pricing pages", stats?.pages],
                  ["Plans", stats?.plans],
                  ["Verified prices", stats?.prices],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex flex-col-reverse gap-1">
                  <dt className="kicker text-muted-foreground">{label}</dt>
                  <dd className="text-3xl font-[650] tracking-[-0.03em]">
                    {value === undefined ? "—" : <CountUp value={value} />}
                  </dd>
                </div>
              ))}
            </dl>
            {stats?.latestScanAt ? (
              <p className="mt-3 font-mono text-2xs text-muted-foreground">
                Last capture <RelativeTime value={stats.latestScanAt} />
              </p>
            ) : null}
          </div>
          {/* On a phone the stack would push the index below the fold; the tape carries the motion. */}
          <div className="min-w-0 max-lg:max-w-md max-sm:hidden">
            <RecordStack records={records} />
          </div>
        </div>
      </section>
      <PriceTape entries={tapeEntries(items)} />
    </>
  );
}

/** One plan price per page in turn, so the tape reads as the market rather than one vendor. */
function tapeEntries(items: DirectoryItem[]): TapeEntry[] {
  const ladders = items.map((item) => ({
    item,
    steps: priceLadder(item.snapshot).filter((step) => step.tier === "paid"),
  }));
  const entries: TapeEntry[] = [];
  for (let round = 0; round < 3; round++)
    for (const { item, steps } of ladders) {
      const step = steps[round];
      if (step)
        entries.push({
          slug: item.slug,
          domain: item.normalizedDomain,
          plan: step.plan,
          price: step.label,
        });
    }
  return entries.slice(0, 36);
}

const CHARGE_LABELS: Record<string, string> = {
  "fixed-subscription": "Subscription",
  "per-seat": "Per seat",
  usage: "Usage",
  credits: "Credits",
  "add-on": "Add-ons",
};

/** The two labels that tell pages apart: how the page charges, and whether it is free to start. */
function keyTags(tags: string[]) {
  const charge = tags.find((tag) => tag in CHARGE_LABELS);
  const access = tags.includes("free-plan")
    ? "Free plan"
    : tags.includes("contact-sales")
      ? "Sales-led"
      : null;
  return [charge ? CHARGE_LABELS[charge]! : null, access].filter(Boolean) as string[];
}

function Directory({ filter }: { filter: DirectoryFilter }) {
  const filtered = hasDirectoryFilter(filter);
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
  const answerChips = describeDirectoryFilter(filter).filter(
    (chip) => chip.id !== "cohort" || filter.signal || filter.choiceKey,
  );
  return (
    <PageShell className="pt-10">
      <section aria-labelledby="directory-title">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <h2 id="directory-title" className="text-2xl tracking-[-0.02em]">
              {filtered ? "Matching pricing pages" : "The index"}
            </h2>
            <p className="mt-1 font-mono text-xs text-muted-foreground tabular-nums">
              {directory.isLoading ? "Reading…" : `${total} ${total === 1 ? "page" : "pages"}`}
              {" · "}latest capture of each
            </p>
          </div>
          <Field className="w-full sm:w-80">
            <FieldLabel className="sr-only" htmlFor="directory-search">
              Search pricing pages
            </FieldLabel>
            <InputGroup className="h-10 bg-gray-2">
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
                <Kbd
                  aria-hidden="true"
                  className="transition-opacity group-focus-within/input-group:opacity-0"
                >
                  /
                </Kbd>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </div>
        {filter.signal || filter.choiceKey ? null : <CategoryChips filter={filter} />}
        {answerChips.length ? (
          <div className="flex flex-wrap items-center gap-2 pt-4">
            {answerChips.map((chip) => (
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
        <div className="mt-5" aria-live="polite">
          <div className={`kicker h-9 border-b text-muted-foreground max-md:hidden ${row}`}>
            <span>Page</span>
            <span>Category</span>
            <span>Plans · entry price</span>
            <span>Charges</span>
            <span>Captured</span>
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
              <DirectoryRow key={item.id} item={item} filter={filter} index={index} />
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

/** Categories as one row of switches. "All" is no category at all, so it clears the filter. */
function CategoryChips({ filter }: { filter: DirectoryFilter }) {
  const options = [
    { value: undefined, label: "All" },
    ...CATEGORY_OPTIONS.filter((option) => option.value !== AI_APPLICATIONS_COHORT),
  ];
  return (
    <ChipRow label="Filter by category" className="mt-5">
      {options.map((option) => {
        const active = filter.cohort === option.value;
        return (
          <Link
            key={option.label}
            to="/"
            search={{ ...filter, cohort: option.value }}
            resetScroll={false}
            aria-current={active ? "true" : undefined}
            className={chipClass(active)}
          >
            {option.label}
          </Link>
        );
      })}
    </ChipRow>
  );
}

const row =
  "grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.05fr)_minmax(0,1fr)_minmax(0,0.95fr)_5.5rem_1rem] items-center gap-5 max-md:grid-cols-[minmax(0,1fr)_auto]";

function DirectoryRow({
  item,
  filter,
  index,
}: {
  item: DirectoryItem;
  filter: DirectoryFilter;
  index: number;
}) {
  const category = categoryOf(item);
  const ladder = priceLadder(item.snapshot);
  const entry = entryLabel(item.snapshot);
  const plans = item.snapshot?.status === "collected" ? item.snapshot.offers.length : 0;
  const tags = keyTags(item.tags);
  return (
    <RowLink
      className={row}
      to="/pages/$slug"
      params={{ slug: item.slug }}
      search={filter}
      style={{ animationDelay: staggerDelay(index) }}
    >
      <span className="flex min-w-0 items-center gap-3">
        <Monogram domain={item.normalizedDomain} />
        <span className="flex min-w-0 flex-col">
          <strong className="truncate text-[0.9375rem] leading-tight font-semibold">
            {item.normalizedDomain}
          </strong>
          <small className="truncate text-xs text-muted-foreground md:hidden">
            {category ? formatToken(category) : "Unclassified"}
          </small>
        </span>
      </span>
      <span className="truncate text-muted-foreground max-md:hidden">
        {category ? formatToken(category) : "Unclassified"}
      </span>
      <span className="flex items-center gap-3 max-md:justify-end">
        <PriceLadder steps={ladder} />
        <span className="flex flex-col font-mono text-xs leading-tight tabular-nums">
          <span className="text-foreground">{entry ?? "—"}</span>
          {plans ? (
            <span className="text-2xs text-muted-foreground">
              {plans} {plans === 1 ? "plan" : "plans"}
            </span>
          ) : null}
        </span>
      </span>
      <span className="flex flex-wrap gap-1.5 max-md:hidden">
        {tags.map((tag) => (
          <span key={tag} className="border border-gray-5 px-1.5 text-xs leading-5 text-gray-11">
            {tag}
          </span>
        ))}
      </span>
      <RelativeTime
        className="font-mono text-2xs text-muted-foreground max-md:hidden"
        value={item.scannedAt}
      />
      <RowArrow className="max-md:hidden" />
    </RowLink>
  );
}

/** Holds the row rhythm while the index loads so results never shift the page. */
function DirectorySkeleton() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => (
        <div className="flex min-h-14 items-center gap-3 border-b border-gray-4" key={index}>
          <Skeleton className="size-8" />
          <Skeleton className="h-2.5" style={{ width: `${22 + ((index * 13) % 20)}%` }} />
        </div>
      ))}
    </div>
  );
}
