import { Link } from "@tanstack/react-router";

export type TapeEntry = { slug: string; domain: string; plan: string; price: string };

/**
 * The latest verified prices running past like a market tape. It holds two copies of its
 * entries and slides by one copy's width, so the loop has no seam. Hover or focus holds it.
 */
export function PriceTape({ entries }: { entries: TapeEntry[] }) {
  if (entries.length < 4) return null;
  return (
    <section
      aria-label="Latest verified prices"
      className="group relative overflow-hidden border-y border-gray-4 bg-gray-2/60 [mask-image:linear-gradient(90deg,transparent,#000_5%,#000_95%,transparent)]"
    >
      <ul
        className="flex w-max motion-safe:animate-tape group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused]"
        style={{ animationDuration: `${Math.max(40, entries.length * 4)}s` }}
      >
        {[0, 1].map((copy) =>
          entries.map((entry, index) => (
            <li
              key={`${copy}:${index}`}
              aria-hidden={copy === 1 ? true : undefined}
              className="flex items-center"
            >
              <Link
                to="/pages/$slug"
                params={{ slug: entry.slug }}
                tabIndex={copy === 1 ? -1 : undefined}
                className="flex items-baseline gap-2.5 px-6 py-3 font-mono text-xs whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
              >
                <span>{entry.domain}</span>
                <span className="text-gray-9">{entry.plan}</span>
                <strong className="font-medium text-foreground tabular-nums">{entry.price}</strong>
              </Link>
              <span className="size-1 bg-brand-9" aria-hidden="true" />
            </li>
          )),
        )}
      </ul>
    </section>
  );
}
