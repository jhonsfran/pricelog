import type { NumericPrices } from "@pricelog/db/numeric-prices";
import type { PublishedSnapshot } from "@pricelog/db/pricing-snapshot";
import type { PageChoice, PageSignal } from "@pricelog/db/schema/pages";

import type { VerifiedPricingChange } from "./pricing-history";

/** One published capture of a page, as the version rail lists it. */
export type PublicVersionSummary = {
  runId: string;
  capturedAt: number;
  /** Whether the captured text differs from the capture before it; null for the first capture. */
  textChanged: boolean | null;
  plans: number;
};

/** Everything a reader sees for one published capture. Owner-only artifacts are not here. */
export type PublicVersion = {
  runId: string;
  capturedAt: number;
  title: string | null;
  finalUrl: string;
  rubricId: string;
  model: string;
  choices: PageChoice[];
  signals: PageSignal[];
  tags: string[];
  snapshot: PublishedSnapshot | null;
  numericPrices: NumericPrices | null;
  previous: { runId: string; capturedAt: number } | null;
  /** Changes both archived pages show; null when the two captures cannot be compared. */
  changes: VerifiedPricingChange[] | null;
};

export function publicScreenshotUrl(pageId: string, runId: string) {
  return `/api/public/pages/${encodeURIComponent(pageId)}/runs/${encodeURIComponent(runId)}/screenshot`;
}
