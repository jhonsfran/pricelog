import type { PublishedPrice, PublishedSnapshot } from "@pricelog/api/pricing-snapshot";
import { Button } from "@pricelog/ui/components/button";
import { cn } from "@pricelog/ui/lib/utils";
import { Check, Minus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatToken } from "@/lib/format";
import {
  type Billing,
  type FeatureCell,
  billingNote,
  billingViews,
  cleanQuote,
  defaultBilling,
  displayPrice,
  featureRows,
  headlinePrice,
  otherQuotes,
  planColumns,
  priceText,
} from "@/lib/pricing-display";
import { Disclosure } from "./page";

/** Feature rows shown before the grid asks to open. */
const FEATURE_PREVIEW = 10;

/**
 * The plans side by side, the way the page itself sets them: one card per plan with its price on
 * top and every feature the page lists, row for row, so a limit reads across all plans at once.
 */
export function PlanGrid({
  snapshot,
  changedPlans,
}: {
  snapshot: PublishedSnapshot;
  /** Plans whose verified prices or listing changed since the capture before. */
  changedPlans?: ReadonlySet<string>;
}) {
  const columns = planColumns(snapshot);
  const views = billingViews(snapshot);
  const [billing, setBilling] = useState<Billing | null>(() => defaultBilling(snapshot));
  const [expanded, setExpanded] = useState(false);
  const { offered, absent } = featureRows(snapshot.features, columns);
  const rows = expanded ? offered : offered.slice(0, FEATURE_PREVIEW);
  const scroller = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // A grid wider than the page scrolls sideways; a fade on the clipped edge says there is more,
  // and the feature column casts a shadow once plans pass under it.
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const update = () => {
      setClipped(element.scrollLeft + element.clientWidth < element.scrollWidth - 4);
      setScrolled(element.scrollLeft > 0);
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      element.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [columns.length, rows.length]);

  if (!columns.length) return null;
  const card = "border-x border-gray-5 bg-gray-2";
  const labelled = rows.length > 0;
  // The label column is sticky. Its shadow fills the gap to the first card, so nothing scrolling
  // past shows through it, and deepens once the grid has moved.
  const sticky = cn(
    "sticky left-0 z-10 bg-background",
    scrolled
      ? "shadow-[8px_0_0_var(--color-background),18px_0_18px_-10px_rgb(0_0_0/0.7)]"
      : "shadow-[8px_0_0_var(--color-background)]",
  );

  return (
    <section aria-labelledby="plans-title" className="mt-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="plans-title" className="text-2xl tracking-[-0.02em]">
            Plans
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {columns.length} {columns.length === 1 ? "plan" : "plans"}
            {snapshot.features.length
              ? ` · ${snapshot.features.length} features, as the page lists them`
              : ""}
            {clipped ? (
              <span className="text-gray-11"> · scroll sideways for all plans →</span>
            ) : null}
          </p>
        </div>
        {views.length === 2 && billing ? (
          <BillingSwitch value={billing} onChange={setBilling} />
        ) : null}
      </div>
      {/* The table's edge spacing sits in the negative margin, so its first column lines up with
          the heading and nothing can show to the left of the sticky column. */}
      <div className="relative -mx-2 mt-5 overflow-hidden">
        <div ref={scroller} className="overflow-x-auto pt-px pb-2">
          <table className="w-full border-separate border-spacing-x-2 border-spacing-y-0 text-left">
            <caption className="sr-only">Plans, prices and features</caption>
            <thead>
              <tr>
                {labelled ? (
                  <th
                    scope="col"
                    className={cn(
                      sticky,
                      "w-48 min-w-48 pr-3 align-bottom max-sm:w-28 max-sm:min-w-28",
                    )}
                  >
                    <span className="kicker text-muted-foreground">Feature</span>
                  </th>
                ) : null}
                {columns.map((column) => {
                  const price = headlinePrice(column.prices, billing);
                  return (
                    <th
                      key={column.name}
                      scope="col"
                      className={cn(
                        card,
                        "min-w-44 border-t p-4 align-top font-normal max-sm:min-w-40",
                        !rows.length && "border-b",
                      )}
                    >
                      <PlanHead
                        name={column.name}
                        price={price}
                        others={otherQuotes(column.prices, price)}
                        changed={changedPlans?.has(column.name)}
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const last = index === rows.length - 1;
                return (
                  <tr key={row.key}>
                    <th
                      scope="row"
                      className={cn(
                        sticky,
                        "border-t border-gray-4 py-2.5 pr-3 align-top text-[0.8125rem] leading-snug font-normal text-gray-11",
                      )}
                    >
                      {row.name}
                    </th>
                    {row.cells.map((cell, cellIndex) => (
                      <td
                        key={columns[cellIndex]!.name}
                        className={cn(
                          card,
                          "border-t border-t-gray-4 px-4 py-2.5 align-top",
                          last && "border-b border-b-gray-5 pb-4",
                        )}
                      >
                        <FeatureValue cell={cell} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {clipped ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-linear-to-l from-background to-transparent"
          />
        ) : null}
      </div>
      {offered.length > FEATURE_PREVIEW ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? "Show fewer features" : `Show all ${offered.length} features`}
        </Button>
      ) : null}
      {absent.length ? (
        <Disclosure
          summary={`${absent.length} listed ${absent.length === 1 ? "feature" : "features"} no plan includes`}
        >
          <p className="text-muted-foreground">{absent.map((row) => row.name).join(" · ")}</p>
        </Disclosure>
      ) : null}
    </section>
  );
}

function PlanHead({
  name,
  price,
  others,
  changed,
}: {
  name: string;
  price: PublishedPrice | undefined;
  others: PublishedPrice[];
  changed?: boolean;
}) {
  const shown = price ? displayPrice(price) : null;
  const note = price ? billingNote(price) : null;
  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{name}</span>
        {changed ? (
          <span className="kicker border border-signal-6 bg-signal-3 px-1.5 text-signal-11">
            Changed
          </span>
        ) : null}
      </span>
      {shown ? (
        <p className="flex flex-wrap items-baseline gap-x-1">
          <strong
            className={cn(
              "font-[650] tracking-[-0.03em] tabular-nums",
              shown.amount.length > 12 ? "text-base leading-snug" : "text-3xl leading-none",
            )}
          >
            {shown.amount}
          </strong>
          {shown.unit ? <span className="text-sm text-muted-foreground">{shown.unit}</span> : null}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Price not tied to a plan</p>
      )}
      {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
      {others.length ? (
        <ul className="grid gap-0.5 border-t border-gray-5 pt-2 font-mono text-2xs text-muted-foreground">
          {others.map((other, index) => (
            <li key={`${other.price_raw}:${index}`} title={cleanQuote(other.price_raw)}>
              {priceText(other)}
              {other.billing === "annual" || other.billing === "monthly"
                ? ` · ${other.billing}`
                : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function FeatureValue({ cell }: { cell: FeatureCell | null }) {
  if (!cell)
    return (
      <span className="text-gray-7">
        <span aria-hidden="true">·</span>
        <span className="sr-only">Not listed for this plan</span>
      </span>
    );
  const limit = cell.limit ? (
    <span className="font-mono text-xs text-foreground">{cell.limit}</span>
  ) : null;
  switch (cell.status) {
    case "included":
      return (
        <span className="inline-flex items-start gap-1.5">
          <Check className="mt-0.5 size-3.5 shrink-0 text-signal-11" aria-hidden="true" />
          <span className="sr-only">Included</span>
          {limit}
        </span>
      );
    case "limited":
      return limit ?? <span className="text-xs text-foreground">Limited</span>;
    case "add_on":
      return (
        <span className="inline-flex flex-wrap items-baseline gap-1.5">
          <span className="kicker border border-warning-6 px-1 text-warning-11">Add-on</span>
          {limit}
        </span>
      );
    case "contact":
      return <span className="text-xs text-muted-foreground">Contact sales</span>;
    case "not_included":
      return (
        <span className="text-gray-8">
          <Minus className="size-3.5" aria-hidden="true" />
          <span className="sr-only">Not included</span>
        </span>
      );
    default:
      return <span className="text-xs text-warning-11">{formatToken(cell.status)}</span>;
  }
}

function BillingSwitch({
  value,
  onChange,
}: {
  value: Billing;
  onChange: (value: Billing) => void;
}) {
  return (
    <div role="group" aria-label="Billing view" className="flex border border-gray-6 p-0.5">
      {(["monthly", "annual"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "h-8 px-3.5 text-[0.8125rem] transition-colors",
            value === option
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option === "monthly" ? "Monthly" : "Annual"}
        </button>
      ))}
    </div>
  );
}

/** Usage rates, add-ons and quotes the page does not tie to one plan. */
export function SharedPrices({ prices }: { prices: PublishedPrice[] }) {
  if (!prices.length) return null;
  return (
    <section aria-labelledby="shared-title" className="mt-10">
      <h2 id="shared-title" className="text-lg tracking-[-0.015em]">
        Prices not tied to one plan
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Usage rates, add-ons and quotes the page states for every plan, or without naming one.
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {prices.map((price, index) => {
          const shown = displayPrice(price);
          return (
            <li
              key={`${price.price_raw}:${index}`}
              className="grid content-start gap-1.5 border border-gray-5 bg-gray-2 px-4 py-3"
            >
              <span className="kicker text-muted-foreground">{formatToken(price.kind)}</span>
              <p className="flex flex-wrap items-baseline gap-x-1">
                <strong
                  className={cn(
                    "font-[650] tracking-[-0.02em] tabular-nums",
                    shown.amount.length > 16 ? "text-sm leading-snug" : "text-xl",
                  )}
                >
                  {shown.amount}
                </strong>
                {shown.unit ? (
                  <span className="text-sm text-muted-foreground">{shown.unit}</span>
                ) : null}
              </p>
              {shown.amount !== cleanQuote(price.price_raw) ? (
                <span className="font-mono text-2xs text-muted-foreground">
                  {cleanQuote(price.price_raw)}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
