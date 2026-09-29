import type { PublishedSnapshot } from "@pricelog/api/pricing-snapshot";
import { Button } from "@pricelog/ui/components/button";
import { cn } from "@pricelog/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";
import { formatToken } from "@/lib/format";
import { priceLadder } from "@/lib/pricing-display";
import { formatDay } from "@/lib/time";
import { Monogram } from "./monogram";
import { LiveDot } from "./page";

export type StackRecord = {
  id: string;
  slug: string;
  normalizedDomain: string;
  category?: string;
  scannedAt: Date | string;
  snapshot: PublishedSnapshot | null;
};

/** Where each sheet sits by its distance from the front: older captures step up and to the right. */
const DEPTH: Record<number, CSSProperties> = {
  // The filed sheet slides off and is gone before the next one's text comes up.
  [-1]: {
    transform: "translate(-28%, 14%) rotate(-7deg)",
    opacity: 0,
    zIndex: 40,
    transitionDuration: "700ms, 220ms",
  },
  0: { transform: "none", opacity: 1, zIndex: 30 },
  1: { transform: "translate(16px, -16px) scale(0.97)", opacity: 0.7, zIndex: 20 },
  2: { transform: "translate(32px, -32px) scale(0.94)", opacity: 0.4, zIndex: 10 },
  3: { transform: "translate(48px, -48px) scale(0.91)", opacity: 0, zIndex: 0 },
};

/**
 * The index as what it is: a stack of dated captures. The front sheet is a real page's latest
 * capture; every few seconds it is filed away and the next one comes forward.
 */
export function RecordStack({ records }: { records: StackRecord[] }) {
  const [front, setFront] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = records.length;
  const animated = count >= 5;

  useEffect(() => {
    if (!animated || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setFront((index) => (index + 1) % count), 4200);
    return () => clearInterval(timer);
  }, [animated, count, paused]);

  if (!count)
    return (
      <div
        className="mt-12 mr-12 h-[22rem] border border-dashed border-gray-5"
        aria-hidden="true"
      />
    );
  const slots = animated ? [-1, 0, 1, 2, 3] : [0];
  const step = (by: number) => setFront((index) => (index + by + count) % count);

  return (
    <div
      className="grid gap-4"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="relative mt-12 mr-12 h-[22rem]">
        {slots.map((depth) => {
          const record = records[(front + depth + count) % count]!;
          const current = depth === 0;
          return (
            <Link
              key={record.id}
              to="/pages/$slug"
              params={{ slug: record.slug }}
              aria-hidden={current ? undefined : true}
              tabIndex={current ? undefined : -1}
              className={cn(
                "absolute inset-0 origin-bottom-left transition-[transform,opacity] duration-700 ease-out will-change-transform",
                !current && "pointer-events-none",
              )}
              style={DEPTH[depth]}
            >
              <Sheet record={record} front={current} />
            </Link>
          );
        })}
      </div>
      {animated ? (
        <div className="flex items-center gap-2 font-mono text-2xs text-muted-foreground tabular-nums">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Previous capture"
            onClick={() => step(-1)}
          >
            <ChevronLeft />
          </Button>
          <span aria-live="polite">
            {String(front + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
          </span>
          <Button variant="ghost" size="icon-xs" aria-label="Next capture" onClick={() => step(1)}>
            <ChevronRight />
          </Button>
          <span className="ml-auto">{paused ? "Paused" : "Latest captures"}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Sheets behind the front one are blank paper edges; a sheet's record shows once it is on top. */
function Sheet({ record, front }: { record: StackRecord; front: boolean }) {
  const ladder = priceLadder(record.snapshot);
  const top = Math.max(1, ...ladder.map((step) => step.amount ?? 0));
  const plans = record.snapshot?.offers.length ?? 0;
  return (
    <article className="h-full border border-gray-6 bg-gray-2 shadow-[0_30px_60px_-24px_rgb(0_0_0/0.7)]">
      <div
        className={cn(
          "flex h-full flex-col p-5 transition-opacity",
          front ? "opacity-100 delay-100 duration-400" : "opacity-0 duration-150",
        )}
      >
        <header className="flex items-center gap-3">
          <Monogram domain={record.normalizedDomain} />
          <div className="min-w-0">
            <p className="truncate text-base leading-tight font-semibold">
              {record.normalizedDomain}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {record.category ? formatToken(record.category) : "Pricing page"}
            </p>
          </div>
          <span className="kicker ml-auto flex items-center gap-2 text-signal-11">
            <LiveDot live /> Captured
          </span>
        </header>
        <ol className="mt-5 grid flex-1 content-start gap-3">
          {ladder.slice(0, 5).map((step, index) => (
            <li key={`${step.plan}:${index}`} className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="truncate">{step.plan}</span>
                <span className="font-mono text-xs text-foreground tabular-nums">{step.label}</span>
              </div>
              <div className="h-1 bg-gray-4">
                <div
                  className={cn(
                    "h-full",
                    step.tier === "paid" && "bg-brand-9",
                    step.tier === "free" && "w-[3%] bg-gray-8",
                    step.tier === "custom" &&
                      "bg-[repeating-linear-gradient(90deg,var(--color-gray-8)_0_4px,transparent_4px_8px)]",
                  )}
                  style={
                    step.tier === "paid"
                      ? { width: `${Math.round(8 + 92 * Math.sqrt((step.amount ?? 0) / top))}%` }
                      : undefined
                  }
                />
              </div>
            </li>
          ))}
          {ladder.length === 0 ? (
            <li className="text-sm text-muted-foreground">No plan prices on this capture.</li>
          ) : null}
        </ol>
        <footer className="kicker mt-4 flex justify-between border-t border-gray-5 pt-3 text-muted-foreground">
          <span>{formatDay(record.scannedAt)}</span>
          <span>
            {plans} {plans === 1 ? "plan" : "plans"}
          </span>
        </footer>
      </div>
    </article>
  );
}
