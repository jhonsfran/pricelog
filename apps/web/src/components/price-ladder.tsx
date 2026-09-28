import { cn } from "@pricelog/ui/lib/utils";
import type { LadderStep } from "@/lib/pricing-display";

/**
 * A page's plans as bars, cheapest to dearest. Heights follow the square root of the monthly
 * figure, so a $5,000 plan does not flatten a $20 one. A custom plan is an open outline: it has
 * no figure to draw.
 */
export function PriceLadder({ steps, className }: { steps: LadderStep[]; className?: string }) {
  if (!steps.length) return null;
  const top = Math.max(1, ...steps.map((step) => step.amount ?? 0));
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex h-5 items-end gap-0.5", className)}
      title={steps.map((step) => `${step.plan}: ${step.label}`).join(" · ")}
    >
      {steps.slice(0, 8).map((step, index) => (
        <i
          key={`${step.plan}:${index}`}
          className={cn(
            "block w-1 transition-colors duration-200",
            step.tier === "custom"
              ? "h-full border border-dashed border-gray-8"
              : step.tier === "free"
                ? "h-[3px] bg-gray-8"
                : "bg-gray-11 group-hover:bg-brand-9",
          )}
          style={
            step.tier === "paid"
              ? { height: `${Math.round(22 + 78 * Math.sqrt((step.amount ?? 0) / top))}%` }
              : undefined
          }
        />
      ))}
    </span>
  );
}
