import { pagePublicSummary } from "@my-better-t-app/db/schema/pages";
import { or, sql } from "drizzle-orm";

import { AI_APPLICATIONS_COHORT } from "./benchmark";
import {
  AI_APPLICATION_CATEGORY_OPTIONS,
  PRODUCT_CATEGORY_OPTIONS,
  TAG_PROBABILITY_THRESHOLD,
} from "./pricing-intelligence";

/**
 * A bar on the practices page is a population, and reading a population means
 * paging it rather than printing it into a disclosure. These conditions are
 * what a bar links to, so they have to reproduce its numerator exactly:
 * "stated" means the page cleared the same publication threshold the chart
 * counted it under. Filtering on a looser rule would hand back a list that
 * does not add up to the number the reader just clicked.
 */
export function statesSignal(key: string) {
  return sql`exists (select 1 from json_each(${pagePublicSummary.signals}) where json_extract(value, '$.key') = ${key} and json_extract(value, '$.probability') >= ${TAG_PROBABILITY_THRESHOLD})`;
}

/** A published classification, matched on the accepted answer. */
export function hasChoice(key: string, choice: string) {
  return sql`exists (select 1 from json_each(${pagePublicSummary.choices}) where json_extract(value, '$.key') = ${key} and json_extract(value, '$.choice') = ${choice})`;
}

/**
 * A cohort is not always one category. `ai_applications` is an umbrella over
 * eight task categories, so filtering on a single one would return a
 * different population than the chart measured — the reader would click a
 * bar reading 21 and land on a list of 22. Resolving the cohort to the same
 * set of categories the snapshot was built from keeps the two in agreement.
 *
 * Returns undefined for a cohort that spans everything, or one this filter
 * cannot express, so the caller adds no condition rather than a wrong one.
 */
export function inCohort(cohort: string) {
  const categories =
    cohort === AI_APPLICATIONS_COHORT
      ? Object.keys(AI_APPLICATION_CATEGORY_OPTIONS)
      : cohort.startsWith("category:")
        ? [cohort.slice("category:".length)]
        : [];
  const known = categories.filter((category) => Object.hasOwn(PRODUCT_CATEGORY_OPTIONS, category));
  if (known.length === 0) return undefined;
  return or(...known.map((category) => hasChoice("product_category", category)));
}
