import { cn } from "@pricelog/ui/lib/utils";

const rect = "fill-current transition-transform duration-300 ease-out";

/**
 * Three captures of the same page, stepping up and to the right. They
 * overlap far enough that the silhouette reads as one diagonal bar, and
 * the leading square carries the brand colour. Drawn on a 24-unit grid
 * so it stays sharp at any size. The squares fan out when hovered inside
 * a `group/wordmark`.
 */
export function LayerMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={cn("block flex-none overflow-visible text-foreground", className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        className={cn(
          rect,
          "opacity-25 group-hover/wordmark:-translate-x-0.5 group-hover/wordmark:translate-y-0.5",
        )}
        x="0"
        y="13"
        width="11"
        height="11"
      />
      <rect className={cn(rect, "opacity-50")} x="6.5" y="6.5" width="11" height="11" />
      <rect
        className={cn(
          rect,
          "fill-primary group-hover/wordmark:translate-x-0.5 group-hover/wordmark:-translate-y-0.5",
        )}
        x="13"
        y="0"
        width="11"
        height="11"
      />
    </svg>
  );
}
