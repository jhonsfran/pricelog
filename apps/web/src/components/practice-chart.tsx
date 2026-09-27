import { cn } from "@pricelog/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import type { CSSProperties, ReactNode } from "react";
import type { DirectoryFilter } from "@/lib/directory-filter";
import { Disclosure } from "./page";

export type ChartRow = {
  key: string;
  label: string;
  /** 0–1. Drives the bar only; the printed value is passed separately. */
  fill: number;
  display: string;
  /** When set, the row opens the directory filtered to the pages it counts. */
  filter?: DirectoryFilter;
};

/**
 * One question, drawn as a ranked column of bars. Ranking matters: the
 * top row is the finding, so it is the only row that gets the brand
 * colour. Everything a reader needs to audit the number — counts,
 * definitions, sources — goes behind the disclosure rather than
 * competing with the shape.
 */
export function PracticeChart({
  title,
  question,
  rows,
  footnote,
  children,
}: {
  title: string;
  question?: string;
  rows: ChartRow[];
  footnote?: string;
  children?: ReactNode;
}) {
  const ranked = [...rows].sort((left, right) => right.fill - left.fill);
  return (
    <section className="border-b border-gray-4 pt-6 pb-5">
      <h3 className="text-lg">{title}</h3>
      {question ? <p className="mt-2 max-w-[68ch] text-muted-foreground">{question}</p> : null}
      {ranked.length === 0 ? (
        <p className="mt-4 text-muted-foreground">No page in this cohort has a confident answer.</p>
      ) : (
        <ol className="mt-6 grid gap-3.5">
          {ranked.map((row, index) => (
            <li
              key={row.key}
              className="grid grid-cols-[minmax(0,13rem)_minmax(0,1fr)_4.5rem] gap-x-4.5 gap-y-2 max-md:grid-cols-[minmax(0,1fr)_4rem]"
              style={{ "--fill": row.fill } as CSSProperties}
            >
              {row.filter ? (
                <Link className={inner} to="/" search={row.filter}>
                  <ChartRowBody row={row} lead={index === 0 && row.fill > 0} index={index} />
                </Link>
              ) : (
                <span className={inner}>
                  <ChartRowBody row={row} lead={index === 0 && row.fill > 0} index={index} />
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {footnote ? <p className="mt-4 text-xs text-muted-foreground">{footnote}</p> : null}
      {children ? (
        <Disclosure summary="Counts, definitions and sources">{children}</Disclosure>
      ) : null}
    </section>
  );
}

// A linked row keeps the bar geometry and gains an affordance.
const inner = "group col-span-full grid grid-cols-subgrid items-center";

function ChartRowBody({ row, lead, index }: { row: ChartRow; lead: boolean; index: number }) {
  return (
    <>
      <span
        className={cn(
          "min-w-0 leading-snug max-md:col-span-full",
          lead ? "text-foreground" : "text-gray-11",
          row.filter &&
            "underline decoration-gray-7 underline-offset-3 group-hover:text-foreground group-hover:decoration-current",
        )}
      >
        {row.label}
      </span>
      <span className="block h-3 bg-gray-3" aria-hidden="true">
        {/* Bars sweep up from empty on first paint. */}
        <span
          className={cn(
            "block h-full origin-left scale-x-(--fill) transition-[scale,filter] duration-[620ms] ease-out group-hover:brightness-125 starting:scale-x-0",
            lead ? "bg-brand-9" : "bg-gray-8",
          )}
          style={{ transitionDelay: `${Math.min(index, 8) * 40}ms` }}
        />
      </span>
      <span
        className={cn(
          "justify-self-end font-mono text-base tabular-nums",
          lead ? "text-brand-11" : "text-gray-11",
        )}
      >
        {row.display}
      </span>
    </>
  );
}
