import { cn } from "@pricelog/ui/lib/utils";
import type { ReactNode } from "react";

/** A row of filter chips that scrolls sideways on a phone and wraps on a wide screen. */
export function ChipRow({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "-mx-6 flex gap-1.5 overflow-x-auto px-6 pb-1 max-sm:-mx-4 max-sm:px-4 md:flex-wrap",
        className,
      )}
    >
      {children}
    </nav>
  );
}

/** One filter chip. The chosen one is solid; an empty one recedes but stays reachable. */
export function chipClass(active: boolean, empty = false) {
  return cn(
    "inline-flex h-8 shrink-0 items-center gap-1.5 border px-3 text-[0.8125rem] whitespace-nowrap transition-colors",
    active
      ? "border-foreground bg-foreground text-background"
      : empty
        ? "border-gray-4 text-gray-9 hover:border-gray-7 hover:text-muted-foreground"
        : "border-gray-5 text-muted-foreground hover:border-gray-8 hover:text-foreground",
  );
}

/** A switch between a few views of the same thing. */
export const segmentGroup = "inline-flex max-w-full overflow-x-auto border border-gray-6 p-0.5";

export function segmentClass(active: boolean) {
  return cn(
    "inline-flex h-8 shrink-0 items-center px-3.5 text-[0.8125rem] whitespace-nowrap transition-colors",
    active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
  );
}
