import {
  TAG_PROBABILITY_THRESHOLD,
  getPricingChoiceLabel,
  getPricingSignalMetadata,
} from "@pricelog/api/pricing-intelligence";
import {
  monetizationMetrics,
  planOffers,
  type PublishedSnapshot,
} from "@pricelog/api/pricing-snapshot";
import type { ReactNode } from "react";
import { formatToken } from "@/lib/format";
import { entryLabel, formatMoney, priceLadder } from "@pricelog/api/pricing-display";

type Choice = { key: string; choice: string };
type Signal = { key: string; probability: number };

/** Answers read better as the plain phrase a person would say. */
const ANSWER_LABELS: Record<string, string> = {
  full: "Every plan",
  partial: "Some plans",
  none: "No plan",
  runs_tasks: "Runs or tasks",
  pay_as_you_go: "Charged as overage",
  hard_stop: "Usage stops",
  auto_upgrade: "Moved to a higher plan",
  buy_credits: "Buy more credits",
  yes: "Yes",
  no: "No",
};

const PROFILE_KEYS = ["metered_unit", "limit_behavior", "spend_cap", "price_disclosure"] as const;
const PROFILE_LABELS: Record<string, string> = {
  metered_unit: "Meters",
  limit_behavior: "When usage runs out",
  spend_cap: "Spend cap",
  price_disclosure: "Prices published for",
};

/**
 * The few numbers a founder checks first, then how the page charges. Only what the capture
 * establishes is shown: a missing row means the page does not settle it.
 */
export function AtAGlance({
  snapshot,
  choices,
  signals,
}: {
  snapshot: PublishedSnapshot | null;
  choices: Choice[];
  signals: Signal[];
}) {
  const collected = snapshot?.status === "collected" ? snapshot : null;
  const metered = choices.find((choice) => choice.key === "metered_unit")?.choice;
  const metrics = collected ? monetizationMetrics(collected, metered) : {};
  const ladder = priceLadder(collected);
  const entry = entryLabel(collected);
  const top = ladder.filter((step) => step.tier === "paid").at(-1);
  const free = ladder.some((step) => step.tier === "free");
  const charges = signals.flatMap((signal) => {
    const metadata = getPricingSignalMetadata(signal.key);
    return signal.key.startsWith("charges_") &&
      signal.probability >= TAG_PROBABILITY_THRESHOLD &&
      metadata
      ? [metadata.label]
      : [];
  });
  const unit = metrics.effective_unit_price?.[0];
  const rows: { label: string; value: ReactNode }[] = [];
  const plans = collected ? planOffers(collected) : [];
  if (plans.length)
    rows.push({
      label: "Plans",
      value: `${plans.length}${free ? ", one free" : ""}`,
    });
  if (top && metrics.price_ladder)
    rows.push({ label: "Top plan", value: `${top.label} · ${metrics.price_ladder.ratio}× entry` });
  if (metrics.annual_discount)
    rows.push({
      label: "Paying yearly saves",
      value: `${metrics.annual_discount.median}% (median)`,
    });
  if (unit)
    rows.push({
      label: `Included ${unit.unit}s`,
      value: `${formatMoney(unit.per_thousand, unit.currency)} per 1,000 on ${unit.plan}`,
    });
  if (charges.length) rows.push({ label: "Charges", value: charges.join(" · ") });
  for (const key of PROFILE_KEYS) {
    const choice = choices.find((item) => item.key === key)?.choice;
    if (choice)
      rows.push({
        label: PROFILE_LABELS[key] ?? getPricingChoiceLabel(key),
        value: ANSWER_LABELS[choice] ?? formatToken(choice),
      });
  }

  return (
    <section aria-label="At a glance" className="border border-gray-5 bg-gray-2">
      <div className="border-b border-gray-5 px-5 py-4">
        <p className="kicker text-muted-foreground">Starts at</p>
        <p className="mt-1.5 text-4xl leading-none font-[650] tracking-[-0.035em] tabular-nums">
          {entry ?? "Not stated"}
        </p>
        {metrics.entry_price ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {metrics.entry_price.plan}
            {free ? " · a free plan comes first" : ""}
          </p>
        ) : free ? (
          <p className="mt-2 text-sm text-muted-foreground">A free plan comes first</p>
        ) : null}
      </div>
      {rows.length ? (
        <dl className="grid px-5 py-2">
          {rows.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-3 border-b border-gray-4 py-2.5 text-sm last:border-b-0"
            >
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="px-5 py-4 text-sm text-muted-foreground">
          This capture does not establish the page's plans or prices.
        </p>
      )}
    </section>
  );
}
