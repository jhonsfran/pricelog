import { Badge } from "@my-better-t-app/ui/components/badge";
import { Spinner } from "@my-better-t-app/ui/components/spinner";
import { cn } from "@my-better-t-app/ui/lib/utils";
import { Link, createLink } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { LayerTitle } from "./layer-title";

export function PageShell({
  narrow,
  className,
  ...props
}: ComponentProps<"main"> & { narrow?: boolean }) {
  return (
    <main
      className={cn(
        "mx-auto w-full px-6 pb-20 max-sm:px-4",
        narrow ? "max-w-217" : "max-w-292",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Every page opens the same way: what kind of record this is, its name
 * printed as a stack of captures, then whatever the reader needs beside it.
 */
export function PageHeader({
  eyebrow,
  title,
  depth,
  children,
  aside,
  className,
}: {
  eyebrow: string;
  title: string;
  depth?: number;
  children?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "grid gap-6 border-b py-10 max-sm:py-8 md:grid-cols-2 md:items-end md:gap-16",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="kicker text-muted-foreground">{eyebrow}</p>
        <h1 className="mt-3 text-4xl leading-none font-bold tracking-[-0.035em] font-stretch-[86%] sm:text-5xl lg:text-6xl">
          <LayerTitle depth={depth}>{title}</LayerTitle>
        </h1>
        {children}
      </div>
      {aside}
    </header>
  );
}

export function Lede({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn("max-w-120 text-base/relaxed text-muted-foreground md:text-lg", className)}
      {...props}
    />
  );
}

export function SectionHeading({
  title,
  meta,
  id,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "kicker flex min-h-10 items-center justify-between gap-4 text-muted-foreground",
        className,
      )}
    >
      <span id={id}>{title}</span>
      {meta === undefined ? null : <span className="tabular-nums">{meta}</span>}
    </div>
  );
}

export const BackLink = createLink(function BackAnchor({
  className,
  children,
  ...props
}: ComponentProps<"a">) {
  return (
    <a
      className={cn(
        "group kicker mt-7 inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
      {...props}
    >
      <ArrowLeft
        className="size-3.5 transition-transform duration-200 ease-out group-hover:-translate-x-0.5"
        aria-hidden="true"
      />
      {children}
    </a>
  );
});

/**
 * A row in a list of records. Hover paints pseudo-elements instead of
 * animating layout, so a 50-row list never reflows on pointer move.
 */
export const RowLink = createLink(function RowAnchor({ className, ...props }: ComponentProps<"a">) {
  return (
    <a
      className={cn(
        "group relative isolate grid min-h-20 items-center gap-6 border-b border-gray-4 motion-safe:animate-enter max-md:gap-3.5",
        "before:absolute before:inset-y-0 before:-inset-x-3.5 before:-z-10 before:bg-gray-2 before:opacity-0 before:transition-opacity hover:before:opacity-100 focus-visible:before:opacity-100 active:before:bg-gray-3 active:before:opacity-100",
        "after:absolute after:inset-y-0 after:-left-3.5 after:w-0.5 after:origin-center after:scale-y-0 after:bg-foreground after:transition-transform after:duration-200 after:ease-out hover:after:scale-y-100",
        className,
      )}
      {...props}
    />
  );
});

export function RowArrow({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "justify-self-end text-lg opacity-0 transition duration-200 ease-out group-hover:translate-x-0 group-hover:opacity-100 max-md:opacity-100 md:-translate-x-1",
        className,
      )}
      aria-hidden="true"
    >
      ↗
    </span>
  );
}

/** A record's name, its address, and up to three labels under them. */
export function RecordIdentity({
  name,
  address,
  children,
}: {
  name: string;
  address: string;
  children?: ReactNode;
}) {
  return (
    <span className="flex min-w-0 flex-col gap-1.5">
      <strong className="truncate font-display text-base leading-tight font-semibold tracking-tight">
        {name}
      </strong>
      <small className="truncate font-mono text-2xs text-muted-foreground">{address}</small>
      {children}
    </span>
  );
}

/** What a list says when it has nothing, or nothing yet. */
export function Notice({
  loading,
  className,
  children,
  ...props
}: ComponentProps<"p"> & { loading?: boolean }) {
  return (
    <p
      role={loading ? "status" : undefined}
      className={cn(
        "flex items-center gap-3 border-b py-16 text-muted-foreground [&_a]:text-foreground",
        className,
      )}
      {...props}
    >
      {loading ? <Spinner aria-hidden="true" /> : null}
      {children}
    </p>
  );
}

export function StatePage({ text, loading }: { text: string; loading?: boolean }) {
  return (
    <main
      role={loading ? "status" : undefined}
      className="grid min-h-[70vh] place-content-center justify-items-center gap-5 text-center text-muted-foreground"
    >
      {loading ? <Spinner aria-hidden="true" /> : null}
      <p>{text}</p>
      {loading ? null : <Link to="/">Return to directory</Link>}
    </main>
  );
}

/**
 * Everything a reader needs to audit a number, one click away. A native
 * disclosure, so it works before hydration and in find-in-page.
 */
export function Disclosure({
  summary,
  children,
  className,
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={cn("mt-4", className)}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 py-1.5 text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="size-3.5 transition-transform duration-200 ease-out [details[open]>summary>&]:rotate-90"
          aria-hidden="true"
        />
        {summary}
      </summary>
      <div className="mt-2 grid gap-4 border-l py-1 pl-5">{children}</div>
    </details>
  );
}

/** Literal text from an archived capture. */
export function Evidence({ className, ...props }: ComponentProps<"blockquote">) {
  return (
    <blockquote
      className={cn(
        "border-l-2 border-gray-6 pl-3.5 font-mono text-xs/relaxed whitespace-pre-wrap text-gray-11 wrap-anywhere",
        className,
      )}
      {...props}
    />
  );
}

export function Definitions({
  items,
  className,
}: {
  items: readonly { term: ReactNode; detail: ReactNode; key?: string }[];
  className?: string;
}) {
  return (
    <dl className={cn("grid gap-2.5", className)}>
      {items.map((item, index) => (
        <div
          key={item.key ?? index}
          className="grid gap-1 sm:grid-cols-[minmax(0,10rem)_1fr] sm:gap-4"
        >
          <dt className="text-foreground">{item.term}</dt>
          <dd className="text-muted-foreground wrap-anywhere">{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A line of counts. The number is the content; the label names it. */
export function StatRow({
  items,
  className,
}: {
  items: readonly { label: string; value: ReactNode }[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 pt-px pl-px sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]",
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="-mt-px -ml-px flex flex-col-reverse gap-1 border px-4 py-3"
        >
          <dt className="kicker text-muted-foreground">{item.label}</dt>
          <dd className="font-display text-2xl font-semibold tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Lit while the record is current; grey once the capture has aged out. */
export function LiveDot({ live }: { live?: boolean }) {
  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        live ? "bg-signal-9 motion-safe:animate-signal-ping" : "bg-gray-8",
      )}
      aria-hidden="true"
    />
  );
}

/** A published label on a record. Quiet by design: it classifies, it does not signal. */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <Badge variant="outline" className="kicker h-auto px-1.5 py-0.5 text-2xs text-gray-11">
      {children}
    </Badge>
  );
}
