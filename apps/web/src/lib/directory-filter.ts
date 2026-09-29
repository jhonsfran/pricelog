import { AI_APPLICATIONS_COHORT, ALL_COHORT, cohortLabel } from "@pricelog/api/benchmark";
import { formatToken } from "./format";
import {
  getPricingChoiceLabel,
  getPricingSignalMetadata,
} from "@pricelog/api/pricing-intelligence";

/**
 * The shape a practices chart hands to the directory. Field names match the
 * API input exactly, so the URL, the query and the SQL all say the same thing
 * and there is no translation layer to drift.
 */
export type DirectoryFilter = {
  signal?: string;
  choiceKey?: string;
  choiceValue?: string;
  /** The cohort the chart was measured over, not a single category: the
      umbrella cohort covers eight of them and must filter to all eight. */
  cohort?: string;
};

export const EMPTY_FILTER: DirectoryFilter = {};

export function parseDirectoryFilter(search: Record<string, unknown>): DirectoryFilter {
  const read = (key: string) => (typeof search[key] === "string" ? search[key] : undefined);
  const choiceKey = read("choiceKey");
  const choiceValue = read("choiceValue");
  const signal = read("signal");
  const cohort = read("cohort");
  const answer = Boolean(signal || (choiceKey && choiceValue));
  return {
    signal,
    // A half-specified classification filters nothing, so it is dropped
    // rather than silently widening the result.
    choiceKey: choiceValue ? choiceKey : undefined,
    choiceValue: choiceKey ? choiceValue : undefined,
    // "All AI applications" is the category every comparison starts from. Browsing, it means no
    // category at all; only a chart's answer keeps it, to list that chart's exact population.
    cohort: cohort === AI_APPLICATIONS_COHORT && !answer ? undefined : cohort,
  };
}

/** A page record's address: the directory filter it was opened from, and the version shown. */
export function parsePageSearch(search: Record<string, unknown>): DirectoryFilter & { v?: string } {
  return {
    ...parseDirectoryFilter(search),
    v: typeof search.v === "string" && search.v ? search.v : undefined,
  };
}

export function hasDirectoryFilter(filter: DirectoryFilter) {
  return Boolean(filter.signal || (filter.choiceKey && filter.choiceValue) || filter.cohort);
}

export type FilterChip = {
  id: string;
  kind: string;
  label: string;
  /** The same filter with this one condition removed. */
  without: DirectoryFilter;
};

/** One removable chip per active condition, labelled the way the chart labelled it. */
export function describeDirectoryFilter(filter: DirectoryFilter): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filter.cohort && filter.cohort !== ALL_COHORT) {
    chips.push({
      id: "cohort",
      kind: "Category",
      label: cohortLabel(filter.cohort),
      without: { ...filter, cohort: undefined },
    });
  }
  if (filter.signal) {
    chips.push({
      id: "signal",
      kind: "States",
      label: getPricingSignalMetadata(filter.signal)?.label ?? formatToken(filter.signal),
      without: { ...filter, signal: undefined },
    });
  }
  if (filter.choiceKey && filter.choiceValue) {
    chips.push({
      id: "choice",
      kind: getPricingChoiceLabel(filter.choiceKey),
      label: formatToken(filter.choiceValue),
      without: { ...filter, choiceKey: undefined, choiceValue: undefined },
    });
  }
  return chips;
}
