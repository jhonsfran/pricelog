import { AI_APPLICATIONS_COHORT, cohortLabel } from "@my-better-t-app/api/benchmark";
import { AI_APPLICATION_CATEGORY_OPTIONS } from "@my-better-t-app/api/pricing-intelligence";

export const CATEGORY_OPTIONS = [
  { value: AI_APPLICATIONS_COHORT, label: "All AI applications" },
  ...Object.keys(AI_APPLICATION_CATEGORY_OPTIONS).map((key) => ({
    value: `category:${key}`,
    label: cohortLabel(`category:${key}`),
  })),
  { value: "category:model_apis", label: "Model APIs" },
];

export type ComparisonTopic = "charging_structure" | "monetization" | "prices";
export type ComparisonSearch = { cohort?: string; topic?: ComparisonTopic };

export function parseCategorySearch(search: Record<string, unknown>): { cohort?: string } {
  return { cohort: CATEGORY_OPTIONS.find((option) => option.value === search.cohort)?.value };
}

export function parseComparisonSearch(search: Record<string, unknown>): ComparisonSearch {
  const topic = ["charging_structure", "monetization", "prices"].find(
    (value) => value === search.topic,
  ) as ComparisonTopic | undefined;
  return {
    ...parseCategorySearch(search),
    // Router search merges with raw URL values. Override invalid values explicitly.
    topic,
  };
}
