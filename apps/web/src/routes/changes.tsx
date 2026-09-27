import { AI_APPLICATIONS_COHORT, COHORT_MINIMUM } from "@pricelog/api/benchmark";
import { Link, createFileRoute } from "@tanstack/react-router";
import { CategoryPicker } from "@/components/category-picker";
import { Lede, PageHeader, PageShell } from "@/components/page";
import { parseCategorySearch } from "@/lib/comparison-search";
import { WeeklyChangesReport } from "@/components/weekly-changes-report";

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
  const navigate = Route.useNavigate();

  return (
    <PageShell>
      <PageHeader
        eyebrow="Published pricing terms"
        title="Weekly changes"
        aside={
          <Lede>
            See which pricing terms changed between the last two complete weeks. Each change
            includes dated sources and before-and-after text.
          </Lede>
        }
      />
      <div className="grid gap-5 py-6 md:grid-cols-2">
        <CategoryPicker
          value={cohort}
          onChange={(value) => navigate({ search: { cohort: value }, resetScroll: false })}
        />
      </div>
      <p className="flex flex-wrap items-baseline gap-x-4.5 gap-y-2 border-t border-gray-4 pt-3.5 font-mono text-xs text-muted-foreground">
        <span>Verified against archived pricing pages</span>
        <span className="md:ml-auto">
          <Link to="/methodology" search={{ cohort }}>
            How comparisons are verified
          </Link>
        </span>
      </p>
      <WeeklyChangesReport cohort={cohort} minimum={COHORT_MINIMUM} />
    </PageShell>
  );
}
