import type { VerifiedPricingChange } from "@pricelog/api/pricing-history";
import { cn } from "@pricelog/ui/lib/utils";
import { useState } from "react";
import { formatDay } from "@/lib/time";

const PREVIEW = 5;

/** The plans a list of changes touches, read back from each change's key. */
export function changedPlans(changes: VerifiedPricingChange[] | null | undefined) {
  const plans = new Set<string>();
  for (const change of changes ?? []) {
    const [kind, plan] = change.key.split(":");
    if ((kind === "offer" || kind === "price") && plan) plans.add(plan);
  }
  return plans;
}

/**
 * What moved since the capture before, and only what both archived pages show. A first capture,
 * or two captures read by different methods, say so instead of showing an empty list.
 */
export function VersionChanges({
  previous,
  changes,
}: {
  previous: { capturedAt: number } | null;
  changes: VerifiedPricingChange[] | null;
}) {
  const [open, setOpen] = useState(false);
  const since = previous ? formatDay(previous.capturedAt) : null;
  const shown = open ? (changes ?? []) : (changes ?? []).slice(0, PREVIEW);
  return (
    <section aria-label="Changes since the previous capture" className="border border-gray-5">
      <header className="flex items-baseline justify-between gap-3 border-b border-gray-5 px-5 py-3">
        <h2 className="text-sm tracking-normal">{since ? `Since ${since}` : "First capture"}</h2>
        {changes?.length ? (
          <span className="font-mono text-xs text-signal-11 tabular-nums">
            {changes.length} verified {changes.length === 1 ? "change" : "changes"}
          </span>
        ) : null}
      </header>
      {!previous ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">
          The record of this page starts here. Later captures are compared with this one.
        </p>
      ) : changes === null ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">
          Not comparable: the two captures were read by different methods or show another currency.
        </p>
      ) : changes.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">
          No verified pricing changes. Plans, prices and listed features match.
        </p>
      ) : (
        <ol>
          {shown.map((change) => (
            <li
              key={change.key}
              className="grid gap-1 border-b border-gray-4 px-5 py-3 last:border-b-0"
            >
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{change.label}</span>
                <span
                  className={cn(
                    "kicker shrink-0",
                    change.kind === "commercial" ? "text-brand-11" : "text-muted-foreground",
                  )}
                >
                  {change.kind === "commercial" ? "Price" : "Feature"}
                </span>
              </span>
              <span className="flex flex-wrap items-baseline gap-2 font-mono text-xs tabular-nums">
                <span className="text-muted-foreground line-through decoration-gray-8">
                  {change.beforeLabel}
                </span>
                <span className="text-gray-8" aria-hidden="true">
                  →
                </span>
                <strong className="font-medium text-foreground">{change.afterLabel}</strong>
              </span>
            </li>
          ))}
          {(changes?.length ?? 0) > PREVIEW ? (
            <li className="px-5 py-2.5">
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setOpen((value) => !value)}
              >
                {open ? "Show fewer" : `Show all ${changes!.length} changes`}
              </button>
            </li>
          ) : null}
        </ol>
      )}
    </section>
  );
}
