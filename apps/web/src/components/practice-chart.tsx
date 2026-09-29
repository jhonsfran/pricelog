import { cn } from "@pricelog/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import type { DirectoryFilter } from "@/lib/directory-filter";
import { PageStack, type StackPage } from "./page-stack";

export type ChartRow = {
  key: string;
  label: string;
  /** 0–1. Drives the bar only; the printed value is passed separately. */
  fill: number;
  display: string;
  /** When set, the row opens the directory filtered to the pages it counts. */
  filter?: DirectoryFilter;
  /** Pages the row counts, from the category's sample, and how many it counts in all. */
  pages?: StackPage[];
  count?: number;
};

/**
 * One question as a card: the answer most pages give, then every answer as a ranked bar with the
 * pages behind it. The top row is the finding, so it alone gets the brand colour.
 */
export function PracticeChart({
  title,
  question,
  rows,
  total,
  footnote,
}: {
  title: string;
  question?: string;
  rows: ChartRow[];
  /** What a count is out of, for the finding: "2 of 3". */
  total?: number;
  footnote?: string;
}) {
  const ranked = [...rows].sort((left, right) => right.fill - left.fill);
  const [top, next] = ranked;
  const lead = top && top.fill > 0 ? top : null;
  const tied = Boolean(lead && next && next.fill === lead.fill);
  return (
    <section className="border border-gray-5 bg-gray-2/40">
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3 border-b border-gray-5 px-5 py-4">
        <div className="min-w-[min(100%,18rem)] flex-1">
          <h3 className="text-base tracking-[-0.01em]">{title}</h3>
          {question ? (
            <p className="mt-1 max-w-[62ch] text-sm text-muted-foreground">{question}</p>
          ) : null}
        </div>
        {lead ? (
          <p className="grid justify-items-end text-right max-sm:justify-items-start max-sm:text-left">
            <strong className="font-mono text-2xl leading-none font-medium text-brand-11 tabular-nums">
              {lead.display}
              {total !== undefined && !lead.display.endsWith("%") ? (
                <span className="text-base text-muted-foreground"> of {total}</span>
              ) : null}
            </strong>
            <span className="mt-1.5 text-xs text-muted-foreground">
              {tied ? "Tied for most common" : `Most common: ${lead.label}`}
            </span>
          </p>
        ) : null}
      </header>
      {ranked.length === 0 ? (
        <p className="px-5 py-5 text-sm text-muted-foreground">
          No page in this category has a confident answer.
        </p>
      ) : (
        <ol className="grid grid-cols-[minmax(0,13rem)_minmax(0,1fr)_3.5rem_7.5rem] gap-x-4 gap-y-2.5 px-5 py-4 max-md:grid-cols-[minmax(0,1fr)_3.5rem]">
          {ranked.map((row, index) => (
            <li
              key={row.key}
              className="col-span-full grid grid-cols-subgrid items-center"
              style={{ "--fill": row.fill } as CSSProperties}
            >
              {row.filter ? (
                <Link className={inner} to="/" search={row.filter}>
                  <ChartRowBody row={row} lead={row.fill === lead?.fill} index={index} />
                </Link>
              ) : (
                <span className={inner}>
                  <ChartRowBody row={row} lead={row.fill === lead?.fill} index={index} />
                </span>
              )}
              <PageStack
                pages={row.pages ?? []}
                total={row.count}
                className="justify-self-end max-md:hidden"
              />
            </li>
          ))}
        </ol>
      )}
      {footnote ? (
        <p className="border-t border-gray-5 px-5 py-3 text-xs text-muted-foreground">{footnote}</p>
      ) : null}
    </section>
  );
}

// A linked row keeps the bar geometry and gains an affordance.
const inner =
  "group col-span-3 grid min-h-8 grid-cols-subgrid items-center max-md:col-span-full max-md:gap-y-1.5";

function ChartRowBody({ row, lead, index }: { row: ChartRow; lead: boolean; index: number }) {
  return (
    <>
      <span
        className={cn(
          "min-w-0 text-sm leading-snug max-md:col-span-full",
          lead ? "text-foreground" : "text-gray-11",
          row.filter &&
            "underline decoration-gray-7 underline-offset-3 group-hover:text-foreground group-hover:decoration-current",
        )}
      >
        {row.label}
      </span>
      <span className="block h-2.5 bg-gray-4" aria-hidden="true">
        {/* Bars sweep up from empty on first paint. */}
        <span
          className={cn(
            "block h-full origin-left scale-x-(--fill) transition-[scale,filter] duration-[620ms] ease-out group-hover:brightness-125 starting:scale-x-0",
            lead ? "bg-brand-9" : "bg-gray-9",
          )}
          style={{ transitionDelay: `${Math.min(index, 8) * 40}ms` }}
        />
      </span>
      <span
        className={cn(
          "justify-self-end font-mono text-sm tabular-nums",
          lead ? "text-brand-11" : "text-gray-11",
        )}
      >
        {row.display}
      </span>
    </>
  );
}
