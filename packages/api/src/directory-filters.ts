import { pagePublicSummary } from "@my-better-t-app/db/schema/pages";
import { or, sql } from "drizzle-orm";

import { AI_APPLICATIONS_COHORT, AI_NATIVE_COHORT, ALL_COHORT } from "./benchmark";
import {
  AI_APPLICATION_CATEGORY_OPTIONS,
  isPricingSignalKey,
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

/** Match every cohort supported by benchmark aggregation. Unknown cohorts contain no pages. */
export function inCohort(cohort: string) {
  if (cohort === ALL_COHORT) return undefined;
  if (cohort === AI_NATIVE_COHORT) return statesSignal("is_ai_native");
  if (cohort.startsWith("market:")) {
    const key = `market_${cohort.slice("market:".length)}`;
    return isPricingSignalKey(key) ? statesSignal(key) : sql`0`;
  }
  const categories =
    cohort === AI_APPLICATIONS_COHORT
      ? Object.keys(AI_APPLICATION_CATEGORY_OPTIONS)
      : cohort.startsWith("category:")
        ? [cohort.slice("category:".length)]
        : [];
  const known = categories.filter(
    (category) =>
      Object.hasOwn(PRODUCT_CATEGORY_OPTIONS, category) &&
      category !== "not_disclosed" &&
      category !== "unknown",
  );
  if (known.length === 0) return sql`0`;
  return or(...known.map((category) => hasChoice("product_category", category)));
}
