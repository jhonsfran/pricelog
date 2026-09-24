import { LayerTitle } from "@/components/layer-title";
import { AI_APPLICATIONS_COHORT, COHORT_MINIMUM } from "@my-better-t-app/api/benchmark";
import { Link, createFileRoute } from "@tanstack/react-router";
import { CategoryPicker } from "@/components/category-picker";
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
    <main className="directory-shell benchmark-shell">
      <section className="benchmark-hero">
        <div>
          <p className="eyebrow">Published pricing terms</p>
          <h1>
            <LayerTitle>Weekly changes</LayerTitle>
          </h1>
        </div>
        <p className="hero-copy">
          See which pricing terms changed between the last two complete weeks. Each change includes
          dated sources and before-and-after text.
        </p>
      </section>
      <div className="comparison-controls">
        <CategoryPicker
          value={cohort}
          onChange={(value) => navigate({ search: { cohort: value }, resetScroll: false })}
        />
      </div>
      <p className="cohort-summary">
        <span>Verified against archived pricing pages</span>
        <Link to="/methodology" search={{ cohort }}>
          How comparisons are verified
        </Link>
      </p>
      <WeeklyChangesReport cohort={cohort} minimum={COHORT_MINIMUM} />
    </main>
  );
}
