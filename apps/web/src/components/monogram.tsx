import { cn } from "@pricelog/ui/lib/utils";

/** A page's initial on a square sheet: every record in the index gets the same mark, drawn from its domain. */
export function Monogram({ domain, className }: { domain: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 place-items-center border border-gray-5 bg-gray-3 font-mono text-xs font-semibold text-gray-11 uppercase",
        className,
      )}
    >
      {domain.replace(/^www\./, "").charAt(0)}
    </span>
  );
}
