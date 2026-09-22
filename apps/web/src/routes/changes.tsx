import { AI_APPLICATIONS_COHORT, COHORT_MINIMUM } from "@my-better-t-app/api/benchmark";
import { AI_APPLICATION_CATEGORY_OPTIONS } from "@my-better-t-app/api/pricing-intelligence";
import { ToggleGroup, ToggleGroupItem } from "@my-better-t-app/ui/components/toggle-group";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { formatToken } from "@/components/intelligence-profile";
import { LayerTitle } from "@/components/layer-title";
import { WeeklyChangesReport } from "@/components/weekly-changes-report";

export const Route = createFileRoute("/changes")({ component: ChangesPage });
const categories = Object.keys(AI_APPLICATION_CATEGORY_OPTIONS);

/**
 * Weekly changes used to be the last section of the practices page, where
 * a reader arrived only after ten charts. It is the only part of this site
 * that is news, so it gets its own address.
 */
function ChangesPage() {
  const [cohort, setCohort] = useState(AI_APPLICATIONS_COHORT);
  const options = [
    { cohort: AI_APPLICATIONS_COHORT, label: "AI applications" },
    ...categories.map((key) => ({ cohort: `category:${key}`, label: formatToken(key) })),
    { cohort: "category:model_apis", label: "Model APIs" },
  ];

  return (
    <main className="directory-shell benchmark-shell">
      <section className="benchmark-hero">
        <div>
          <p className="eyebrow">What moved</p>
          <h1>
            <LayerTitle>WEEKLY CHANGES</LayerTitle>
          </h1>
        </div>
        <p className="hero-copy">
          Two adjacent completed UTC weeks, compared capture against capture. Every item links to
          both archived sources and quotes the line it turned on.
        </p>
      </section>
      <ToggleGroup
        className="cohort-picker"
        aria-label="Product category"
        variant="outline"
        spacing={0}
        value={[cohort]}
        onValueChange={(value) => setCohort(value[0] ?? cohort)}
      >
        {options.map((option) => (
          <ToggleGroupItem key={option.cohort} value={option.cohort}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="cohort-summary">
        <span>A different model answer alone is not a change</span>
        <Link to="/methodology">How comparisons are verified</Link>
      </p>
      <WeeklyChangesReport cohort={cohort} minimum={COHORT_MINIMUM} />
    </main>
  );
}
