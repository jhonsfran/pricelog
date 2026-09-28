import { cn } from "@pricelog/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { Monogram } from "./monogram";

export type StackPage = { slug: string; domain: string };

/**
 * The pages behind a number, as a fan of their marks. Each opens its record; a count follows for
 * pages the sample does not show.
 */
export function PageStack({
  pages,
  total,
  max = 4,
  className,
}: {
  pages: StackPage[];
  /** How many pages the number counts, when more than the ones listed. */
  total?: number;
  max?: number;
  className?: string;
}) {
  const shown = pages.slice(0, max);
  const more = Math.max(0, (total ?? pages.length) - shown.length);
  if (!shown.length && !more) return <span className={className} />;
  return (
    <span className={cn("flex items-center", className)}>
      {shown.map((page, index) => (
        <Link
          key={page.slug}
          to="/pages/$slug"
          params={{ slug: page.slug }}
          title={page.domain}
          aria-label={page.domain}
          className={cn(
            "relative transition-transform duration-200 ease-out hover:z-10 hover:-translate-y-0.5",
            index > 0 && "-ml-1.5",
          )}
        >
          <Monogram
            domain={page.domain}
            className="size-6 text-[0.625rem] ring-2 ring-background"
          />
        </Link>
      ))}
      {more ? (
        <span className="ml-2 font-mono text-2xs text-muted-foreground tabular-nums">+{more}</span>
      ) : null}
    </span>
  );
}
