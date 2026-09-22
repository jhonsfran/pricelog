import { ALL_COHORT, cohortLabel } from "@my-better-t-app/api/benchmark";
import {
  getPricingChoiceLabel,
  getPricingSignalMetadata,
} from "@my-better-t-app/api/pricing-intelligence";

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
  return {
    signal: read("signal"),
    // A half-specified classification filters nothing, so it is dropped
    // rather than silently widening the result.
    choiceKey: choiceValue ? choiceKey : undefined,
    choiceValue: choiceKey ? choiceValue : undefined,
    cohort: read("cohort"),
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
      label: getPricingSignalMetadata(filter.signal)?.label ?? formatValue(filter.signal),
      without: { ...filter, signal: undefined },
    });
  }
  if (filter.choiceKey && filter.choiceValue) {
    chips.push({
      id: "choice",
      kind: getPricingChoiceLabel(filter.choiceKey),
      label: formatValue(filter.choiceValue),
      without: { ...filter, choiceKey: undefined, choiceValue: undefined },
    });
  }
  return chips;
}

function formatValue(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
