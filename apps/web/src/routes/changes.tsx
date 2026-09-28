import { AI_APPLICATIONS_COHORT, COHORT_MINIMUM } from "@pricelog/api/benchmark";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChipRow, chipClass } from "@/components/chips";
import { Lede, PageHeader, PageShell } from "@/components/page";
import { WeeklyChangesReport } from "@/components/weekly-changes-report";
import { CATEGORY_OPTIONS, parseCategorySearch } from "@/lib/comparison-search";

export const Route = createFileRoute("/changes")({
  component: ChangesPage,
  validateSearch: parseCategorySearch,
});

/**
 * Weekly changes used to be the last section of the practices page, where
 * a reader arrived only after ten charts. It is the only part of this site
 * that is news, so it gets its own address.
 */
function ChangesPage() {
  const { cohort = AI_APPLICATIONS_COHORT } = Route.useSearch();

  return (
    <PageShell>
      <PageHeader
        eyebrow="Weekly changes"
        title="What changed last week"
        aside={
          <Link
            to="/methodology"
            search={{ cohort }}
            className="font-mono text-xs text-muted-foreground underline decoration-gray-8 underline-offset-4 transition-colors hover:text-foreground md:justify-self-end"
          >
            How comparisons are verified
          </Link>
        }
      >
        <Lede>
          Every change is checked against the archived pages of both weeks, with the text before and
          after.
        </Lede>
      </PageHeader>
      <ChipRow label="Product category">
        {CATEGORY_OPTIONS.map((option) => (
          <Link
            key={option.value}
            to="/changes"
            search={{ cohort: option.value }}
            resetScroll={false}
            aria-current={option.value === cohort ? "true" : undefined}
            className={chipClass(option.value === cohort)}
          >
            {option.label}
          </Link>
        ))}
      </ChipRow>
      <WeeklyChangesReport cohort={cohort} minimum={COHORT_MINIMUM} />
    </PageShell>
  );
}
