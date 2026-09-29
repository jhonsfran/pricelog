import type { PublicVersionSummary } from "@pricelog/api/page-versions";
import { buttonVariants } from "@pricelog/ui/components/button";
import { cn } from "@pricelog/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";
import type { DirectoryFilter } from "@/lib/directory-filter";
import { formatDay, formatStamp } from "@/lib/time";

function markOf(version: PublicVersionSummary) {
  if (version.textChanged === null) return { tone: "bg-gray-11", note: "First capture" };
  return version.textChanged
    ? { tone: "bg-signal-9", note: "The page text changed since the capture before" }
    : { tone: "border border-gray-8", note: "Same page text as the capture before" };
}

/**
 * Every published capture of the page on one line, oldest to newest, the way the record grew.
 * A lit mark is a capture whose page text changed; a hollow one repeated the capture before it.
 */
export function VersionRail({
  slug,
  filter,
  versions,
  selected,
}: {
  slug: string;
  filter: DirectoryFilter;
  /** Newest first, as the API lists them. */
  versions: PublicVersionSummary[];
  selected: string;
}) {
  const rail = useRef<HTMLOListElement>(null);
  const chronological = [...versions].reverse();
  const position = chronological.findIndex((version) => version.runId === selected);
  const latest = versions[0]?.runId;
  const at = (index: number) => chronological[index];
  const searchFor = (runId: string) => ({ ...filter, v: runId === latest ? undefined : runId });

  // Centre the selected version by scrolling the rail alone; scrollIntoView would move the page too.
  useEffect(() => {
    const list = rail.current;
    const item = list?.querySelector<HTMLElement>("[data-selected]")?.parentElement;
    if (list && item) list.scrollLeft = item.offsetLeft - (list.clientWidth - item.clientWidth) / 2;
  }, [selected, versions.length]);

  if (!versions.length) return null;
  const older = at(position - 1);
  const newer = at(position + 1);
  const arrow = cn(buttonVariants({ variant: "outline", size: "icon-sm" }), "shrink-0");
  return (
    <nav aria-label="Versions of this pricing page" className="flex items-center gap-2">
      <span className="kicker mr-2 shrink-0 text-muted-foreground max-sm:hidden">
        {versions.length} {versions.length === 1 ? "version" : "versions"}
      </span>
      {older ? (
        <Link
          to="/pages/$slug"
          params={{ slug }}
          search={searchFor(older.runId)}
          resetScroll={false}
          className={arrow}
          aria-label={`Older version, ${formatDay(older.capturedAt)}`}
        >
          <ChevronLeft />
        </Link>
      ) : (
        <span className={cn(arrow, "pointer-events-none opacity-40")} aria-hidden="true">
          <ChevronLeft />
        </span>
      )}
      <ol ref={rail} className="relative flex min-w-0 gap-1 overflow-x-auto py-1">
        {chronological.map((version) => {
          const current = version.runId === selected;
          const mark = markOf(version);
          return (
            <li key={version.runId} className="shrink-0">
              <Link
                to="/pages/$slug"
                params={{ slug }}
                search={searchFor(version.runId)}
                resetScroll={false}
                aria-current={current ? "true" : undefined}
                data-selected={current ? "" : undefined}
                title={`${formatStamp(version.capturedAt)} · ${mark.note}`}
                className={cn(
                  "flex h-8 items-center gap-2 border px-2.5 font-mono text-xs whitespace-nowrap tabular-nums transition-colors",
                  current
                    ? "border-brand-8 bg-brand-3 text-foreground"
                    : "border-gray-5 text-muted-foreground hover:border-gray-8 hover:text-foreground",
                )}
              >
                <span className={cn("size-1.5 shrink-0", mark.tone)} aria-hidden="true" />
                {formatDay(version.capturedAt)}
                {version.runId === latest ? (
                  <span className="kicker text-signal-11">Latest</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ol>
      {newer ? (
        <Link
          to="/pages/$slug"
          params={{ slug }}
          search={searchFor(newer.runId)}
          resetScroll={false}
          className={arrow}
          aria-label={`Newer version, ${formatDay(newer.capturedAt)}`}
        >
          <ChevronRight />
        </Link>
      ) : (
        <span className={cn(arrow, "pointer-events-none opacity-40")} aria-hidden="true">
          <ChevronRight />
        </span>
      )}
    </nav>
  );
}
