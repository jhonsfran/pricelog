import type { VerifiedPricingChange } from "@pricelog/api/pricing-history";
import { PRICING_SNAPSHOT_VERSION, type PublishedSnapshot } from "@pricelog/db/pricing-snapshot";

import { confirmChanges, diffSnapshots } from "./snapshot-changes";

type ComparedVersion = { contentKey: string; model: string; snapshot: PublishedSnapshot | null };

const comparable = (snapshot: PublishedSnapshot | null): snapshot is PublishedSnapshot =>
  snapshot?.status === "collected" && snapshot.version === PRICING_SNAPSHOT_VERSION;

/**
 * What changed between a version and the one before it, under the weekly verifier's rule: both
 * snapshots collected by the same snapshot version and model, in the same visible currency, and
 * every change confirmed by both archived pages. Null means the two cannot be compared.
 */
export async function verifiedVersionChanges(
  before: ComparedVersion | null,
  after: ComparedVersion,
  readContent: (key: string) => Promise<string | null>,
): Promise<VerifiedPricingChange[] | null> {
  if (
    !before ||
    !comparable(before.snapshot) ||
    !comparable(after.snapshot) ||
    before.model !== after.model ||
    before.snapshot.currency_visible !== after.snapshot.currency_visible
  )
    return null;
  const candidates = diffSnapshots(before.snapshot, after.snapshot);
  if (!candidates.length) return [];
  const [beforeText, afterText] = await Promise.all([
    readContent(before.contentKey),
    readContent(after.contentKey),
  ]);
  if (beforeText === null || afterText === null) return null;
  return confirmChanges(candidates, beforeText, afterText);
}
